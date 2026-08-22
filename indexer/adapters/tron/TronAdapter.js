import { TronClient } from './TronClient.js';
import {
    getTokenAddress,
    getTokenDecimals
} from '../../../shared/network-config.js';

import {
    tronAddressToHex,
    tronAddressToTopic
} from './TronAddress.js';


export class TronAdapter {

    constructor(networkId) {

        if (!networkId) {
            throw new Error(
                'TRON networkId is required'
            );
        }

        this.networkId =
            networkId;

        this.client =
            new TronClient(networkId);

        this.tokenAddress =
            getTokenAddress(networkId);

        this.tokenDecimals =
            getTokenDecimals(networkId);

        if (!this.tokenAddress) {
            throw new Error(
                `USDT configuration missing for ${networkId}`
            );
        }
    }

    async getLatestBlock() {

        const block =
            await this.client.getNowBlock();

        const number =
            block?.block_header?.raw_data?.number;

        if (
            !Number.isInteger(number)
        ) {
            throw new Error(
                'Unable to resolve latest TRON block'
            );
        }

        return number;
    }


    async getTransfers(
        treasury,
        fromBlock,
        toBlock
    ) {

        if (!treasury?.id) {
            throw new Error(
                'Treasury id is required'
            );
        }

        if (!treasury?.projectId) {
            throw new Error(
                'Treasury projectId is required'
            );
        }

        if (!treasury?.address) {
            throw new Error(
                'Treasury address is required'
            );
        }

        if (
            !Number.isInteger(fromBlock) ||
            !Number.isInteger(toBlock) ||
            fromBlock < 0 ||
            toBlock < fromBlock
        ) {
            throw new Error(
                'Invalid TRON block range'
            );
        }


        /*
         * TronGrid's TRC20 endpoint is timestamp based.
         *
         * Resolve the timestamps of the requested
         * block boundaries and use them as the query
         * window.
         */

        const fromTimestamp =
            await this.client.getBlockTimestamp(
                fromBlock
            );

        const toTimestamp =
            await this.client.getBlockTimestamp(
                toBlock
            );


        if (
            !Number.isInteger(fromTimestamp) ||
            !Number.isInteger(toTimestamp)
        ) {
            throw new Error(
                'Unable to resolve block timestamps'
            );
        }


        const result =
            await this.client.getTRC20Transfers(
                this.tokenAddress,
                treasury.address,
                fromTimestamp,
                toTimestamp
            );


        const transfers = [];


        for (
            const transfer of
            (result.data || [])
        ) {

            /*
             * We only accept incoming USDT transfers.
             */

            if (
                transfer.type !== 'Transfer' ||
                transfer.to !== treasury.address
            ) {
                continue;
            }


            /*
             * Get transaction receipt/logs.
             */

            const txInfo =
                await this.client.getTransactionInfo(
                    transfer.transaction_id
                );


            if (
                txInfo?.receipt?.result !==
                'SUCCESS'
            ) {
                continue;
            }


            /*
             * Resolve the actual block number.
             */

            const blockNumber =
                txInfo.blockNumber;


            if (
                !Number.isInteger(blockNumber)
            ) {
                continue;
            }


            /*
             * Timestamp filtering is not enough.
             *
             * TronGrid queries by timestamp, so we
             * explicitly enforce the requested block
             * range here.
             */

            if (
                blockNumber < fromBlock ||
                blockNumber > toBlock
            ) {
                continue;
            }


            /*
             * Find the canonical TRC20 Transfer event.
             */

            const event =
                this._findTransferEvent(
                    txInfo,
                    this.tokenAddress,
                    treasury.address
                );


            if (!event) {
                continue;
            }


            /*
             * TRON transaction timestamp is
             * milliseconds since Unix epoch.
             */

            const timestamp =
                Number.isInteger(
                    txInfo.blockTimeStamp
                )
                    ? Math.floor(
                        txInfo.blockTimeStamp / 1000
                    )
                    : null;


            if (
                !Number.isInteger(timestamp)
            ) {
                continue;
            }


            /*
             * Normalized transfer record.
             *
             * This is the canonical contract between
             * Adapter and SyncEngine.
             */

            transfers.push({

                networkId:
                    this.networkId,

                projectId:
                    treasury.projectId,

                treasuryId:
                    treasury.id,

                treasury:
                    treasury.address,

                donor:
                    transfer.from,

                token:
                    'USDT',

                tokenAddress:
                    this.tokenAddress,

                amountRaw:
                    String(
                        transfer.value
                    ),

                amount:
                    Number(
                        transfer.value
                    ) /
                    Math.pow(
                        10,
                        this.tokenDecimals
                    ),

                txHash:
                    transfer.transaction_id,

                blockNumber,

                eventIndex:
                    event.index,

                timestamp
            });
        }


        return transfers;
    }


    _findTransferEvent(
        txInfo,
        tokenAddress,
        treasuryAddress
    ) {

        const TRANSFER_TOPIC =
            'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';


        const tokenHex =
            tronAddressToHex(
                tokenAddress
            )
                .slice(-40)
                .toLowerCase();


        const treasuryTopic =
            tronAddressToTopic(
                treasuryAddress
            )
                .toLowerCase();


        return (
            txInfo?.log || []
        )
            .map(
                (log, index) => ({
                    log,
                    index
                })
            )
            .find(
                ({ log }) => {

                    if (
                        log.address?.toLowerCase() !==
                        tokenHex
                    ) {
                        return false;
                    }

                    if (
                        log.topics?.[0]?.toLowerCase() !==
                        TRANSFER_TOPIC
                    ) {
                        return false;
                    }

                    return (
                        log.topics?.[2]?.toLowerCase() ===
                        treasuryTopic
                    );
                }
            ) || null;
    }
}
