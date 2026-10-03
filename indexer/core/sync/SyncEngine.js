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
                        Number.isInteger(treasury.scanFromBlock)
                            ? treasury.scanFromBlock
                            : (options.scanFromBlock || 0)
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
                latestBlock - safeConfirmations
            );


        const overlap =
            options.overlap ?? 10;


        const previousScanned =
            Number(state.last_scanned_block || 0);


        let fromBlock =
            Math.max(
                0,
                previousScanned -
                overlap +
                1
            );


        // Optional forced rewind (admin recovery): options.rewindToBlock
        if (
            Number.isInteger(options.rewindToBlock) &&
            options.rewindToBlock >= 0
        ) {
            fromBlock = Math.min(fromBlock, options.rewindToBlock);
        }


        if (
            Number.isInteger(treasury.scanFromBlock) &&
            treasury.scanFromBlock > fromBlock
        ) {
            fromBlock = treasury.scanFromBlock;
        }


        const maxBlocks =
            this._maxBlocksPerRun(
                treasury.networkId,
                options
            );


        let toBlock =
            Math.min(
                lastFinalizedBlock,
                fromBlock + maxBlocks - 1
            );


        if (fromBlock > toBlock) {

            return {

                treasuryId:
                    treasury.id,

                fromBlock,

                toBlock:
                    previousScanned,

                transfers: 0,

                inserted: 0,

                status:
                    'UP_TO_DATE'
            };
        }


        try {

            const rawResult =
                await adapter.getTransfers(
                    treasury,
                    fromBlock,
                    toBlock,
                    {
                        ...options,
                        // Informational only — adapters must use [fromBlock, toBlock]
                        // so SyncEngine overlap is effective (esp. Tron).
                        lastScannedBlock:
                            previousScanned
                    }
                );

            const discoveredTransfers =
                Array.isArray(rawResult)
                    ? rawResult
                    : (rawResult?.transfers || []);

            let scannedToBlock =
                Array.isArray(rawResult)
                    ? toBlock
                    : Number.isInteger(rawResult?.scannedToBlock)
                        ? rawResult.scannedToBlock
                        : toBlock;

            const partial =
                !Array.isArray(rawResult) &&
                rawResult?.partial === true;

            /*
             * Conservative cursor:
             * - On partial runs, only advance to what the adapter confirmed.
             * - Never mark success past lastFinalizedBlock or toBlock.
             */
            scannedToBlock = Math.min(
                scannedToBlock,
                toBlock,
                lastFinalizedBlock
            );

            // If adapter returned nothing useful and claimed partial with
            // scannedToBlock behind previousScanned, keep previous cursor
            // (avoid spinning forever on empty partial).
            if (
                partial &&
                scannedToBlock < previousScanned &&
                discoveredTransfers.length === 0 &&
                !Number.isInteger(options.rewindToBlock)
            ) {
                scannedToBlock = previousScanned;
            }


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

                    scannedToBlock,

                    scannedToBlock
                );


            return {

                treasuryId:
                    treasury.id,

                fromBlock,

                toBlock: scannedToBlock,

                requestedToBlock: toBlock,

                previousScanned,

                transfers:
                    (
                        discoveredTransfers || []
                    ).length,

                inserted,

                status:
                    partial || scannedToBlock < lastFinalizedBlock
                        ? 'PARTIAL'
                        : 'SUCCESS'
            };


        } catch (error) {

            const msg =
                error instanceof Error
                    ? error.message
                    : String(error);

            if (/too many subrequests|subrequest limit/i.test(msg)) {
                await this.syncStateRepository
                    .markDeferred(
                        treasury.id,
                        msg
                    );
            } else {
                await this.syncStateRepository
                    .markFailed(
                        treasury.id,
                        msg
                    );
            }

            throw error;
        }
    }
}
