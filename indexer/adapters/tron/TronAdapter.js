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

        this.networkId = networkId;

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

        return block
            .block_header
            .raw_data
            .number;
    }

    async getTransfers(
        treasury,
        fromBlock,
        toBlock
    ) {

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
                'Invalid block range'
            );
        }


        // Convert block range to timestamps.
        const fromBlockData =
            await this.client.getBlock(
                fromBlock
            );

        const toBlockData =
            await this.client.getBlock(
                toBlock
            );


        const fromTimestamp =
            fromBlockData
                ?.block_header
                ?.raw_data
                ?.timestamp;

        const toTimestamp =
            toBlockData
                ?.block_header
                ?.raw_data
                ?.timestamp;


        if (
            !Number.isFinite(fromTimestamp) ||
            !Number.isFinite(toTimestamp)
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

            if (
                transfer.type !== 'Transfer' ||
                transfer.to !== treasury.address
            ) {
                continue;
            }


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


            const blockNumber =
                txInfo.blockNumber;


            // API timestamp filtering can include
            // transactions outside the exact block range.
            if (
                !Number.isInteger(blockNumber) ||
                blockNumber < fromBlock ||
                blockNumber > toBlock
            ) {
                continue;
            }


            const event =
                this._findTransferEvent(
                    txInfo,
                    this.tokenAddress,
                    treasury.address
                );


            if (!event) {
                continue;
            }


            const timestamp =
                Math.floor(
                    txInfo.blockTimeStamp / 1000
                );


            transfers.push({

                network:
                    this.networkId,

                projectId:
                    treasury.projectId,

                treasury:
                    treasury.address,

                donor:
                    transfer.from,

                token:
                    'USDT',

                tokenAddress:
                    this.tokenAddress,

                amountRaw:
                    transfer.value,

                amount:
                    Number(transfer.value) /
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

        const tokenTopic =
            tronAddressToTopic(tokenAddress);

        const treasuryTopic =
            tronAddressToTopic(treasuryAddress);


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
                        tronAddressToHex(tokenAddress)
                            .slice(-40)
                            .toLowerCase()
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