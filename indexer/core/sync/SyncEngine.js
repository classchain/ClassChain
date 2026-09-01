export class SyncEngine {

    constructor({
        treasuryRepository,
        transferRepository,
        syncStateRepository,
        adapters
    }) {

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

        this.treasuryRepository =
            treasuryRepository;

        this.transferRepository =
            transferRepository;

        this.syncStateRepository =
            syncStateRepository;

        this.adapters =
            adapters || {};

        /** networkId -> latest block (cached per run) */
        this._latestBlockCache = new Map();
    }


    async _getLatestBlock(adapter, networkId) {
        if (this._latestBlockCache.has(networkId)) {
            return this._latestBlockCache.get(networkId);
        }
        const latest = await adapter.getLatestBlock();
        this._latestBlockCache.set(networkId, latest);
        return latest;
    }

    /**
     * Keep each treasury under a small RPC budget so
     * Amoy + Nile fit in one Worker invocation.
     */
    _maxBlocksPerRun(networkId, options) {
        if (options.maxBlocksPerRun != null) {
            return options.maxBlocksPerRun;
        }
        if (networkId === 'tron_nile' || String(networkId).startsWith('tron')) {
            return 3_000;
        }
        return 2_000;
    }


    async syncTreasury(
        treasury,
        options = {}
    ) {

        if (!treasury?.id) {
            throw new Error(
                'Treasury id is required'
            );
        }

        const adapter =
            this.adapters[
                treasury.networkId
            ];

        if (!adapter) {
            throw new Error(
                `No adapter for network: ${treasury.networkId}`
            );
        }


        let state =
            await this.syncStateRepository
                .get(treasury.id);


        if (!state) {

            state =
                await this.syncStateRepository
                    .initialize(
                        treasury.id,
                        options.scanFromBlock || 0
                    );
        }


        const latestBlock =
            await this._getLatestBlock(
                adapter,
                treasury.networkId
            );


        const safeConfirmations =
            options.safeConfirmations ?? 20;


        const lastFinalizedBlock =
            Math.max(
                0,
                latestBlock -
                safeConfirmations
            );


        const overlap =
            options.overlap ?? 10;

        const maxBlocksPerRun =
            this._maxBlocksPerRun(
                treasury.networkId,
                options
            );


        let fromBlock;


        if (
            state.last_scanned_block &&
            state.last_scanned_block > 0
        ) {

            fromBlock =
                Math.max(
                    0,
                    state.last_scanned_block -
                    overlap +
                    1
                );

        } else {

            fromBlock =
                state.scan_from_block || 0;
        }


        if (
            fromBlock >
            lastFinalizedBlock
        ) {

            return {

                treasuryId:
                    treasury.id,

                fromBlock,

                toBlock:
                    lastFinalizedBlock,

                transfers: 0,

                inserted: 0,

                status:
                    'UP_TO_DATE'
            };
        }


        const toBlock = Math.min(
            lastFinalizedBlock,
            fromBlock + maxBlocksPerRun - 1
        );


        try {

            const discoveredTransfers =
                await adapter.getTransfers(
                    treasury,
                    fromBlock,
                    toBlock
                );


            let inserted = 0;


            for (
                const transfer
                of discoveredTransfers || []
            ) {

                const result =
                    await this.transferRepository
                        .insert({

                            ...transfer,

                            treasuryId:
                                treasury.id,

                            projectId:
                                treasury.projectId,

                            networkId:
                                treasury.networkId
                        });


                if (result?.inserted) {
                    inserted++;
                }
            }


            await this.syncStateRepository
                .markSuccess(
                    treasury.id,

                    toBlock,

                    toBlock
                );


            return {

                treasuryId:
                    treasury.id,

                fromBlock,

                toBlock,

                transfers:
                    (
                        discoveredTransfers || []
                    ).length,

                inserted,

                status:
                    toBlock < lastFinalizedBlock
                        ? 'PARTIAL'
                        : 'SUCCESS'
            };


        } catch (error) {

            await this.syncStateRepository
                .markFailed(
                    treasury.id,

                    error instanceof Error
                        ? error.message
                        : String(error)
                );

            throw error;
        }
    }
}
