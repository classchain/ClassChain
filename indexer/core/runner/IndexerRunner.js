import { DiscoveryService } from '../discovery/DiscoveryService.js';
import { SyncEngine } from '../sync/SyncEngine.js';


export class IndexerRunner {

    constructor({
        projectRegistry,
        networkResolver,
        treasuryRepository,
        transferRepository,
        syncStateRepository,
        adapters,
        adapterFactory,
        networkIds
    }) {

        if (!projectRegistry) {
            throw new Error(
                'ProjectRegistry is required'
            );
        }

        if (!networkResolver) {
            throw new Error(
                'NetworkResolver is required'
            );
        }

        if (!treasuryRepository) {
            throw new Error(
                'TreasuryRepository is required'
            );
        }

        if (!transferRepository) {
            throw new Error(
                'TransferRepository is required'
            );
        }

        if (!syncStateRepository) {
            throw new Error(
                'SyncStateRepository is required'
            );
        }

        this.discoveryService =
            new DiscoveryService(
                projectRegistry,
                networkResolver
            );

        this.treasuryRepository =
            treasuryRepository;

        this.transferRepository =
            transferRepository;

        this.syncStateRepository =
            syncStateRepository;

        this.adapters =
            adapters || {};

        this.adapterFactory =
            adapterFactory || null;

        this.networkIds =
            Array.isArray(networkIds)
                ? new Set(networkIds)
                : null;
    }


    async runOnce(options = {}) {

        const discovery =
            this.discoveryService.discover();

        const projectIdFilter =
            options.projectId
                ? String(options.projectId)
                : null;

        const summary = {
            discovered:
                discovery.valid.length +
                discovery.invalid.length,

            valid:
                discovery.valid.length,

            invalid:
                discovery.invalid.length,

            synced: 0,

            skipped: 0,

            failed: 0,

            transfers: 0,

            inserted: 0,

            invalidTreasuries:
                discovery.invalid,

            results: []
        };


        const engine =
            this._createSyncEngine();

        /*
         * Fair scheduler:
         * - new/never-synced treasuries first
         * - then the treasury that was synced longest ago
         * - lag is only a tie-breaker
         *
         * This prevents the first treasuries in Projects.json from
         * consuming every run and starving the rest.
         */
        const candidates = [];

        for (const treasury of discovery.valid) {

            if (
                projectIdFilter &&
                String(treasury.projectId) !== projectIdFilter
            ) {
                summary.skipped++;
                summary.results.push({
                    projectId: treasury.projectId,
                    networkId: treasury.networkId,
                    address: treasury.address,
                    status: 'SKIPPED_PROJECT_FILTER'
                });
                continue;
            }

            if (
                !this._shouldSyncNetwork(
                    treasury.networkId
                )
            ) {
                summary.skipped++;

                summary.results.push(
                    this._createSkippedResult(
                        treasury
                    )
                );

                continue;
            }

            let treasuryForResult =
                treasury;

            try {
                await this._ensureAdapter(
                    treasury.networkId
                );

                const persistedTreasury =
                    await this.treasuryRepository
                        .upsert(treasury);

                const treasuryForSync = {
                    ...treasury,

                    ...this._normalizePersistedTreasury(
                        persistedTreasury,
                        treasury
                    )
                };

                treasuryForResult =
                    treasuryForSync;

                const state =
                    await this.syncStateRepository
                        .get(treasuryForSync.id);

                candidates.push({
                    treasury:
                        treasuryForSync,

                    state,

                    lag:
                        this._calculateLag(
                            state,
                            treasuryForSync
                        )
                });

            } catch (error) {
                summary.failed++;

                summary.results.push(
                    this._createFailedResult(
                        treasuryForResult,
                        error
                    )
                );
            }
        }

        candidates.sort(
            (a, b) =>
                this._compareScheduleCandidates(a, b)
        );

        const maxRunMs =
            this._readPositiveNumber(
                options.maxRunMs,
                45_000
            );

        const startedAt =
            Date.now();

        for (const candidate of candidates) {

            if (
                Date.now() - startedAt >=
                maxRunMs
            ) {
                summary.results.push({
                    treasuryId:
                        candidate.treasury.id,

                    projectId:
                        candidate.treasury.projectId,

                    networkId:
                        candidate.treasury.networkId,

                    address:
                        candidate.treasury.address,

                    status:
                        'DEFERRED_RUN_BUDGET'
                });

                continue;
            }

            let treasuryForResult =
                candidate.treasury;

            try {
                const result =
                    await engine.syncTreasury(
                        candidate.treasury,
                        options
                    );

                summary.synced++;

                summary.transfers +=
                    result.transfers || 0;

                summary.inserted +=
                    result.inserted || 0;

                summary.results.push(result);

            } catch (error) {
                const msg =
                    error instanceof Error
                        ? error.message
                        : String(error);

                if (/too many subrequests|subrequest limit/i.test(msg)) {
                    summary.results.push({
                        treasuryId:
                            treasuryForResult.id || null,

                        projectId:
                            treasuryForResult.projectId,

                        networkId:
                            treasuryForResult.networkId,

                        address:
                            treasuryForResult.address,

                        status:
                            'DEFERRED_SUBREQUEST',

                        error: msg
                    });

                    for (
                        let i =
                            candidates.indexOf(candidate) + 1;
                        i < candidates.length;
                        i++
                    ) {
                        const rest =
                            candidates[i];

                        summary.results.push({
                            treasuryId:
                                rest.treasury.id,

                            projectId:
                                rest.treasury.projectId,

                            networkId:
                                rest.treasury.networkId,

                            address:
                                rest.treasury.address,

                            status:
                                'DEFERRED_SUBREQUEST'
                        });
                    }

                    break;
                }

                summary.failed++;

                summary.results.push(
                    this._createFailedResult(
                        treasuryForResult,
                        error
                    )
                );
            }
        }


        return summary;
    }


    _calculateLag(state, treasury) {

        if (!state) {
            return Number.MAX_SAFE_INTEGER;
        }

        const lastScanned =
            Number(state.last_scanned_block || 0);

        const scanFrom =
            Number.isInteger(treasury.scanFromBlock)
                ? treasury.scanFromBlock
                : 0;

        return Math.max(
            0,
            Math.max(lastScanned, scanFrom - 1)
        );
    }


    _compareScheduleCandidates(a, b) {

        const aLast =
            a.state?.last_sync_at
                ? Date.parse(a.state.last_sync_at)
                : 0;

        const bLast =
            b.state?.last_sync_at
                ? Date.parse(b.state.last_sync_at)
                : 0;

        if (aLast !== bLast) {
            return aLast - bLast;
        }

        if (a.lag !== b.lag) {
            return b.lag - a.lag;
        }

        return (
            String(a.treasury.projectId)
                .localeCompare(
                    String(b.treasury.projectId)
                ) ||
            String(a.treasury.networkId)
                .localeCompare(
                    String(b.treasury.networkId)
                )
        );
    }


    _readPositiveNumber(value, fallback) {

        const number =
            Number(value);

        return Number.isFinite(number) &&
            number > 0
            ? number
            : fallback;
    }


    _createSyncEngine() {

        return new SyncEngine({
            treasuryRepository:
                this.treasuryRepository,

            transferRepository:
                this.transferRepository,

            syncStateRepository:
                this.syncStateRepository,

            adapters:
                this.adapters
        });
    }


    async _ensureAdapter(networkId) {

        if (this.adapters[networkId]) {
            return this.adapters[networkId];
        }

        if (!this.adapterFactory) {
            return null;
        }

        const adapter =
            await this.adapterFactory(
                networkId
            );

        if (adapter) {
            this.adapters[networkId] =
                adapter;
        }

        return adapter;
    }


    _shouldSyncNetwork(networkId) {

        return (
            !this.networkIds ||
            this.networkIds.has(
                networkId
            )
        );
    }


    _createSkippedResult(treasury) {

        return {
            treasuryId:
                treasury.id || null,

            projectId:
                treasury.projectId,

            networkId:
                treasury.networkId,

            address:
                treasury.address,

            status:
                'SKIPPED_NETWORK'
        };
    }


    _createFailedResult(
        treasury,
        error
    ) {

        return {
            treasuryId:
                treasury.id || null,

            projectId:
                treasury.projectId,

            networkId:
                treasury.networkId,

            address:
                treasury.address,

            status:
                'FAILED',

            error:
                error instanceof Error
                    ? error.message
                    : String(error)
        };
    }


    _normalizePersistedTreasury(
        persistedTreasury,
        sourceTreasury
    ) {

        if (!persistedTreasury) {
            throw new Error(
                `Treasury was not persisted: ${sourceTreasury.projectId}/${sourceTreasury.networkId}`
            );
        }

        if (!persistedTreasury.id) {
            throw new Error(
                `Persisted treasury has no id: ${sourceTreasury.projectId}/${sourceTreasury.networkId}`
            );
        }

        return {
            id:
                persistedTreasury.id,

            projectId:
                persistedTreasury.project_id ||
                sourceTreasury.projectId,

            networkId:
                persistedTreasury.network_id ||
                sourceTreasury.networkId,

            address:
                persistedTreasury.address ||
                sourceTreasury.address,

            active:
                persistedTreasury.active === undefined
                    ? sourceTreasury.active
                    : Boolean(
                        persistedTreasury.active
                    )
        };
    }
}
