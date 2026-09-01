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

        this.networkId =
            networkId;

        this.network =
            network;

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
                                options.body !== undefined
                                    ? JSON.stringify(
                                        options.body
                                    )
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


    async getBlock(
        blockNumber
    ) {

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


    async getBlockTimestamp(
        blockNumber
    ) {

        const block =
            await this.getBlock(
                blockNumber
            );

        const timestamp =
            block
                ?.block_header
                ?.raw_data
                ?.timestamp;


        if (
            !Number.isFinite(timestamp)
        ) {
            throw new Error(
                `Unable to resolve timestamp for block ${blockNumber}`
            );
        }

        return timestamp;
    }


    async getTransactionInfo(
        txHash
    ) {

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


    /**
     * Incoming TRC20 transfers to a treasury only.
     *
     * Uses account-scoped TronGrid API so we do not
     * page through the entire USDT event stream
     * (that caused Worker subrequest limit failures).
     *
     * GET /v1/accounts/{treasury}/transactions/trc20
     *   ?only_to=true&contract_address={token}
     */
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

        if (
            !Number.isFinite(minTimestamp) ||
            !Number.isFinite(maxTimestamp) ||
            minTimestamp < 0 ||
            maxTimestamp < minTimestamp
        ) {
            throw new Error(
                'Invalid TRC20 timestamp range'
            );
        }


        const transfers = [];

        const seen = new Set();

        let fingerprint = null;

        // Hard cap pages per treasury per call (safety).
        let pages = 0;
        const maxPages = 5;


        while (pages < maxPages) {

            pages += 1;

            const params =
                new URLSearchParams({

                    only_to: 'true',

                    contract_address:
                        tokenAddress,

                    limit:
                        '200',

                    min_timestamp:
                        String(
                            minTimestamp
                        ),

                    max_timestamp:
                        String(
                            maxTimestamp
                        )
                });


            if (fingerprint) {

                params.set(
                    'fingerprint',
                    fingerprint
                );
            }


            const response =
                await this.request(
                    `/v1/accounts/${treasuryAddress}/transactions/trc20?${params.toString()}`,
                    {
                        method: 'GET'
                    }
                );


            if (
                !response ||
                !Array.isArray(response.data)
            ) {
                break;
            }


            for (
                const row of response.data
            ) {

                const transactionId =
                    row?.transaction_id;

                if (!transactionId) {
                    continue;
                }

                const uniqueKey =
                    `${transactionId}:${row?.block_timestamp ?? ''}:${row?.from ?? ''}:${row?.value ?? ''}`;

                if (seen.has(uniqueKey)) {
                    continue;
                }

                seen.add(uniqueKey);

                const from =
                    row.from;

                const to =
                    row.to;

                const value =
                    row.value;

                if (
                    !from ||
                    !to ||
                    value === undefined ||
                    value === null
                ) {
                    continue;
                }

                transfers.push({

                    transaction_id:
                        transactionId,

                    event_index:
                        Number.isInteger(row?.event_count)
                            ? row.event_count
                            : 0,

                    block_number:
                        Number.isInteger(
                            row.block
                        )
                            ? row.block
                            : (
                                Number.isInteger(row.block_number)
                                    ? row.block_number
                                    : null
                            ),

                    block_timestamp:
                        Number.isInteger(
                            row.block_timestamp
                        )
                            ? row.block_timestamp
                            : null,

                    from,

                    to,

                    value:
                        String(value),

                    type:
                        'Transfer',

                    token_info:
                        row.token_info || {
                            symbol: 'USDT',
                            address: tokenAddress
                        }
                });
            }


            const nextFingerprint =
                response.meta?.fingerprint;


            if (
                !nextFingerprint ||
                response.data.length === 0
            ) {
                break;
            }


            if (
                nextFingerprint === fingerprint
            ) {
                break;
            }


            fingerprint =
                nextFingerprint;
        }


        return {
            data: transfers
        };
    }
}
