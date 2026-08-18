export class TronAdapter {

    constructor(config) {

        if (!config) {
            throw new Error('TRON adapter config is required');
        }

        this.config = config;
    }


    async getLatestBlock() {
        throw new Error(
            'TronAdapter.getLatestBlock() not implemented'
        );
    }


    async getTransfers(
        treasury,
        fromBlock,
        toBlock
    ) {

        throw new Error(
            'TronAdapter.getTransfers() not implemented'
        );
    }
}
