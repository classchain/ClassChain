import { TronClient } from './TronClient.js';
import {
    getTokenAddress,
    getTokenDecimals
} from '../../../shared/network-config.js';

import {
    tronHexToAddress
} from './TronAddress.js';


function normalizeTronAddr(addr) {
    if (!addr || typeof addr !== 'string') return '';
    return addr.trim();
}


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


        const treasuryAddress =
            normalizeTronAddr(treasury.address);


        /*
         * Account-scoped incoming TRC20 only.
         * Avoids scanning the global USDT event stream.
         */
        const result =
            await this.client.getTRC20Transfers(
                this.tokenAddress,
                treasuryAddress,
                fromTimestamp,
                toTimestamp
            );


        const transfers = [];


        for (
            const transfer of
            (result.data || [])
        ) {

            if (
                transfer.type !== 'Transfer'
            ) {
                continue;
            }

            const toAddr =
                normalizeTronAddr(
                    typeof transfer.to === 'string' && transfer.to.startsWith('T')
                        ? transfer.to
                        : (tronHexToAddress(transfer.to) || transfer.to)
                );

            if (
                toAddr &&
                toAddr !== treasuryAddress
            ) {
                continue;
            }

            let blockNumber =
                Number.isInteger(transfer.block_number)
                    ? transfer.block_number
                    : null;

            let eventIndex =
                Number.isInteger(transfer.event_index)
                    ? transfer.event_index
                    : 0;

            let timestamp =
                Number.isInteger(transfer.block_timestamp)
                    ? Math.floor(transfer.block_timestamp / 1000)
                    : null;

            /*
             * Only hit gettransactioninfobyid when TronGrid
             * did not provide block number (keeps subrequests low).
             */
            if (!Number.isInteger(blockNumber)) {
                const txInfo =
                    await this.client.getTransactionInfo(
                        transfer.transaction_id
                    );

                if (
                    txInfo?.receipt?.result &&
                    txInfo.receipt.result !== 'SUCCESS'
                ) {
                    continue;
                }

                blockNumber =
                    txInfo?.blockNumber;

                if (
                    Number.isInteger(txInfo?.blockTimeStamp)
                ) {
                    timestamp =
                        Math.floor(txInfo.blockTimeStamp / 1000);
                }
            }

            if (
                !Number.isInteger(blockNumber)
            ) {
                continue;
            }

            if (
                blockNumber < fromBlock ||
                blockNumber > toBlock
            ) {
                continue;
            }

            if (
                !Number.isInteger(timestamp)
            ) {
                timestamp = 0;
            }

            let donor =
                transfer.from;

            if (
                typeof donor === 'string' &&
                !donor.startsWith('T')
            ) {
                donor =
                    tronHexToAddress(donor) || donor;
            }

            const amountNum =
                Number(transfer.value) /
                Math.pow(10, this.tokenDecimals);

            transfers.push({

                networkId:
                    this.networkId,

                projectId:
                    treasury.projectId,

                treasuryId:
                    treasury.id,

                treasury:
                    treasury.address,

                donor,

                token:
                    'USDT',

                tokenAddress:
                    this.tokenAddress,

                amountRaw:
                    String(
                        transfer.value
                    ),

                amount:
                    amountNum,

                txHash:
                    transfer.transaction_id,

                blockNumber,

                eventIndex,

                timestamp
            });
        }


        return transfers;
    }
}
