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


        const hasTronCursor =
            treasury.networkId === 'tron_nile' &&
            typeof state.tron_cursor === 'string' &&
            state.tron_cursor.length > 0;

        let fromBlock =
            Math.max(
                0,
                (state.last_scanned_block || 0) -
                overlap +
                1
            );


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
                    state.last_scanned_block || 0,

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
                        lastScannedBlock:
                            state.last_scanned_block || 0,
                        tronCursor:
                            hasTronCursor ? state.tron_cursor : null,
                        tronCursorMinTimestamp:
                            hasTronCursor ? state.tron_cursor_min_timestamp : null,
                        tronCursorMaxTimestamp:
                            hasTronCursor ? state.tron_cursor_max_timestamp : null
                    }
                );

            const discoveredTransfers =
                Array.isArray(rawResult)
                    ? rawResult
                    : (rawResult?.transfers || []);

            const scannedToBlock =
                Array.isArray(rawResult)
                    ? toBlock
                    : Number.isInteger(rawResult?.scannedToBlock)
                        ? rawResult.scannedToBlock
                        : toBlock;

            const partial =
                !Array.isArray(rawResult) &&
                rawResult?.partial === true;


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


            if (rawResult?.paginationComplete === false) {
                await this.syncStateRepository
                    .markTronCursor(
                        treasury.id,
                        rawResult.nextFingerprint,
                        rawResult.cursorMinTimestamp,
                        rawResult.cursorMaxTimestamp
                    );
            } else if (hasTronCursor) {
                await this.syncStateRepository
                    .clearTronCursor(treasury.id);
            }

            if (partial) {
                await this.syncStateRepository
                    .markPartial(
                        treasury.id,
                        `TRON pagination incomplete; cursor=${rawResult.nextFingerprint || 'none'}`
                    );
            } else {
                await this.syncStateRepository
                    .markSuccess(
                        treasury.id,
                        scannedToBlock,
                        scannedToBlock
                    );
            }


            return {

                treasuryId:
                    treasury.id,

                fromBlock,

                toBlock: scannedToBlock,

                requestedToBlock: toBlock,

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
