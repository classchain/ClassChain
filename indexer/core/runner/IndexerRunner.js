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


        for (const treasury of discovery.valid) {

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

                const result =
                    await engine.syncTreasury(
                        treasuryForSync,
                        options
                    );

                summary.synced++;

                summary.transfers +=
                    result.transfers || 0;

                summary.inserted +=
                    result.inserted || 0;

                summary.results.push(result);

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


        return summary;
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
