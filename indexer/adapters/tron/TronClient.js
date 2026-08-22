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
                await this.getBlock(
                    block
                )
            );
        }

        return blocks;
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
     * Get TRC20 Transfer events emitted by a token contract.
     *
     * TronGrid endpoint:
     *
     * /v1/contracts/{contract}/events
     *
     * We intentionally query the token contract itself
     * and filter the destination treasury in TronAdapter.
     *
     * This is important because the indexer must see the
     * complete Transfer event stream of the USDT contract.
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


        while (true) {

            const params =
                new URLSearchParams({

                    event_name:
                        'Transfer',

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
                    `/v1/contracts/${tokenAddress}/events?${params.toString()}`,
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
                const event of response.data
            ) {

                /*
                 * We explicitly accept only Transfer events.
                 */
                if (
                    event?.event_name !==
                    'Transfer'
                ) {
                    continue;
                }


                const transactionId =
                    event?.transaction_id;


                if (!transactionId) {
                    continue;
                }


                /*
                 * TronGrid exposes event_index.
                 *
                 * Use it as part of the identity so that
                 * two Transfer events in one transaction
                 * cannot collapse into one another.
                 */
                const eventIndex =
                    Number.isInteger(
                        event?.event_index
                    )
                        ? event.event_index
                        : null;


                const uniqueKey =
                    `${transactionId}:${eventIndex ?? 'unknown'}`;


                if (
                    seen.has(uniqueKey)
                ) {
                    continue;
                }


                seen.add(
                    uniqueKey
                );


                const result =
                    event?.result;


                if (!result) {
                    continue;
                }


                /*
                 * TronGrid may expose both numeric keys
                 * and named keys.
                 */
                const from =
                    result.from ??
                    result['0'];


                const to =
                    result.to ??
                    result['1'];


                const value =
                    result.value ??
                    result['2'];


                if (
                    !from ||
                    !to ||
                    value === undefined ||
                    value === null
                ) {
                    continue;
                }


                /*
                 * Keep the raw Transfer event.
                 *
                 * Treasury filtering is intentionally done
                 * in TronAdapter because this client should
                 * remain a generic TRC20 event reader.
                 */
                transfers.push({

                    transaction_id:
                        transactionId,

                    event_index:
                        eventIndex,

                    block_number:
                        Number.isInteger(
                            event.block_number
                        )
                            ? event.block_number
                            : null,

                    block_timestamp:
                        Number.isInteger(
                            event.block_timestamp
                        )
                            ? event.block_timestamp
                            : null,

                    from,

                    to,

                    value:
                        String(value),

                    type:
                        'Transfer',

                    token_info:
                        event.token_info || {
                            symbol: 'USDT',
                            address: tokenAddress
                        }
                });
            }


            /*
             * TronGrid pagination uses the fingerprint
             * returned in meta.fingerprint.
             */
            const nextFingerprint =
                response.meta?.fingerprint;


            if (
                !nextFingerprint ||
                response.data.length === 0
            ) {
                break;
            }


            /*
             * Safety guard against a broken RPC/API response
             * returning the same fingerprint forever.
             */
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
