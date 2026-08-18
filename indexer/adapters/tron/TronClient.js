import {
    getNetworkById,
    getRpcUrls
} from '../../../shared/network-config.js';


export class TronClient {

    constructor(networkId) {

        if (!networkId) {
            throw new Error(
                'TRON networkId is required'
            );
        }

        const network =
            getNetworkById(networkId);

        if (!network) {
            throw new Error(
                `Unknown network: ${networkId}`
            );
        }

        if (network.type !== 'TVM') {
            throw new Error(
                `Network is not TRON/TVM: ${networkId}`
            );
        }

        this.networkId = networkId;

        this.network = network;

        this.rpcUrls =
            getRpcUrls(networkId);

        if (!this.rpcUrls.length) {
            throw new Error(
                `No RPC endpoint configured for ${networkId}`
            );
        }
    }


    async request(
        path,
        options = {}
    ) {

        let lastError = null;

        for (const rpc of this.rpcUrls) {

            try {

                const response =
                    await fetch(
                        `${rpc}${path}`,
                        {
                            method:
                                options.method || 'GET',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                ...(options.headers || {})
                            },

                            body:
                                options.body
                                    ? JSON.stringify(options.body)
                                    : undefined
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        `TRON RPC HTTP ${response.status}`
                    );
                }


                return await response.json();

            } catch (error) {

                lastError = error;
            }
        }


        throw new Error(
            `All RPC endpoints failed for ${this.networkId}: ` +
            `${lastError?.message || 'Unknown error'}`
        );
    }


    async getNowBlock() {

        return this.request(
            '/wallet/getnowblock',
            {
                method: 'POST'
            }
        );
    }

    async getBlock(blockNumber) {

        if (
            !Number.isInteger(blockNumber) ||
            blockNumber < 0
        ) {
            throw new Error(
                'Invalid block number'
            );
        }

        return this.request(
            '/wallet/getblockbynum',
            {
                method: 'POST',
                body: {
                    num: blockNumber
                }
            }
        );
    }

    async getBlocks(
        fromBlock,
        toBlock
    ) {

        if (
            !Number.isInteger(fromBlock) ||
            !Number.isInteger(toBlock) ||
            fromBlock < 0 ||
            toBlock < fromBlock
        ) {
            throw new Error(
                'Invalid block range'
            );
        }

        const blocks = [];

        for (
            let block = fromBlock;
            block <= toBlock;
            block++
        ) {

            blocks.push(
                await this.getBlock(block)
            );
        }

        return blocks;
    }

    async getTransactionInfo(txHash) {

        if (!txHash) {
            throw new Error(
                'Transaction hash is required'
            );
        }

        return this.request(
            '/wallet/gettransactioninfobyid',
            {
                method: 'POST',
                body: {
                    value: txHash
                }
            }
        );
    }


    async getTRC20Transfers(
        tokenAddress,
        treasuryAddress,
        minTimestamp,
        maxTimestamp
    ) {

        if (!tokenAddress) {
            throw new Error(
                'TRC20 token address is required'
            );
        }

        if (!treasuryAddress) {
            throw new Error(
                'Treasury address is required'
            );
        }

        const params =
            new URLSearchParams({
                limit: '200',
                only_to: 'true',
                to_address: treasuryAddress,
                contract_address: tokenAddress,
                min_timestamp:
                    String(minTimestamp),
                max_timestamp:
                    String(maxTimestamp)
            });

        return this.request(
            `/v1/accounts/${treasuryAddress}/transactions/trc20?${params}`,
            {
                method: 'GET'
            }
        );
    }
}