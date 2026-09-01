import { TronClient } from './TronClient.js';
import {
    getTokenAddress,
    getTokenDecimals
} from '../../../shared/network-config.js';

import {
    tronAddressToHex,
    tronAddressToTopic,
    tronHexToAddress
} from './TronAddress.js';


const TRANSFER_TOPIC =
    'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';


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
         * Account-scoped candidates from TronGrid.
         *
         * IMPORTANT: TronGrid /transactions/trc20?only_to=true
         * sometimes returns Approval txs as if they were
         * incoming TRC20 transfers (spender = treasury).
         *
         * Every candidate MUST be confirmed via receipt logs
         * for a real ERC20/TRC20 Transfer event to the treasury.
         */
        const result =
            await this.client.getTRC20Transfers(
                this.tokenAddress,
                treasuryAddress,
                fromTimestamp,
                toTimestamp
            );


        const transfers = [];
        const seenTx = new Set();


        for (
            const candidate of
            (result.data || [])
        ) {

            const txHash =
                candidate.transaction_id;

            if (!txHash || seenTx.has(txHash)) {
                continue;
            }

            seenTx.add(txHash);

            const txInfo =
                await this.client.getTransactionInfo(
                    txHash
                );

            if (
                txInfo?.receipt?.result &&
                txInfo.receipt.result !== 'SUCCESS'
            ) {
                continue;
            }

            const event =
                this._findTransferEvent(
                    txInfo,
                    this.tokenAddress,
                    treasuryAddress
                );

            /*
             * No Transfer log to treasury → skip.
             * Approval-only txs die here.
             */
            if (!event) {
                continue;
            }

            const blockNumber =
                Number.isInteger(txInfo?.blockNumber)
                    ? txInfo.blockNumber
                    : (
                        Number.isInteger(candidate.block_number)
                            ? candidate.block_number
                            : null
                    );

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

            let timestamp = 0;

            if (
                Number.isInteger(txInfo?.blockTimeStamp)
            ) {
                timestamp =
                    Math.floor(txInfo.blockTimeStamp / 1000);
            } else if (
                Number.isInteger(candidate.block_timestamp)
            ) {
                timestamp =
                    Math.floor(candidate.block_timestamp / 1000);
            }

            const donor =
                event.from;

            const amountRaw =
                event.value;

            const amountNum =
                Number(amountRaw) /
                Math.pow(10, this.tokenDecimals);

            if (
                !Number.isFinite(amountNum) ||
                amountNum <= 0
            ) {
                continue;
            }

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
                    String(amountRaw),

                amount:
                    amountNum,

                txHash,

                blockNumber,

                eventIndex:
                    event.index,

                timestamp
            });
        }


        return transfers;
    }


    /**
     * Confirm a real TRC20 Transfer log:
     *  - token contract matches USDT
     *  - topic0 = Transfer
     *  - topic2 (to) = treasury
     */
    _findTransferEvent(
        txInfo,
        tokenAddress,
        treasuryAddress
    ) {

        const tokenHex =
            tronAddressToHex(tokenAddress)
                .slice(-40)
                .toLowerCase();

        const treasuryTopic =
            tronAddressToTopic(treasuryAddress)
                .toLowerCase();

        const logs =
            txInfo?.log || [];

        for (let index = 0; index < logs.length; index++) {

            const log = logs[index];

            const logAddr =
                String(log.address || '')
                    .toLowerCase()
                    .replace(/^0x/, '');

            if (logAddr !== tokenHex) {
                continue;
            }

            const topic0 =
                String(log.topics?.[0] || '')
                    .toLowerCase()
                    .replace(/^0x/, '');

            if (topic0 !== TRANSFER_TOPIC) {
                continue;
            }

            const topic2 =
                String(log.topics?.[2] || '')
                    .toLowerCase()
                    .replace(/^0x/, '')
                    .padStart(64, '0');

            if (topic2 !== treasuryTopic) {
                continue;
            }

            let from = null;

            try {
                const topic1 =
                    String(log.topics?.[1] || '')
                        .replace(/^0x/, '')
                        .slice(-40);

                from =
                    tronHexToAddress(topic1);
            } catch {
                from = null;
            }

            if (!from) {
                continue;
            }

            const dataHex =
                String(log.data || '0')
                    .replace(/^0x/, '') || '0';

            let value;

            try {
                value =
                    BigInt('0x' + dataHex).toString();
            } catch {
                continue;
            }

            return {
                index,
                from,
                value
            };
        }

        return null;
    }
}
