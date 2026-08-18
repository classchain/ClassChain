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
            await adapter.getLatestBlock();


        const safeConfirmations =
            options.safeConfirmations ??
            20;


        const lastFinalizedBlock =
            Math.max(
                0,
                latestBlock -
                safeConfirmations
            );


        const overlap =
            options.overlap ??
            10;


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

                status:
                    'UP_TO_DATE'
            };
        }


        await this.syncStateRepository
            .markSuccess(
                treasury.id,
                fromBlock,
                lastFinalizedBlock
            );


        return {
            treasuryId:
                treasury.id,

            fromBlock,

            toBlock:
                lastFinalizedBlock,

            transfers: 0,

            status:
                'READY'
        };
    }
}