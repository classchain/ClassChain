import { TransferIdentity } from '../core/dedup/TransferIdentity.js';


export class TransferRepository {

    constructor(db) {

        if (!db) {
            throw new Error('D1 database is required');
        }

        this.db = db;
    }


    async insert(transfer) {

        const transferUid =
            TransferIdentity.create({
                networkId: transfer.networkId,
                txHash: transfer.txHash,
                eventIndex: transfer.eventIndex
            });


        const result =
            await this.db
                .prepare(`
                    INSERT INTO transfers (
                        treasury_id,
                        project_id,
                        network_id,
                        token,
                        token_address,
                        donor,
                        amount_raw,
                        amount,
                        tx_hash,
                        block_number,
                        event_index,
                        timestamp,
                        transfer_uid,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (transfer_uid)
                    DO NOTHING
                `)
                .bind(
                    transfer.treasuryId,
                    transfer.projectId,
                    transfer.networkId,
                    transfer.token,
                    transfer.tokenAddress,
                    transfer.donor,
                    transfer.amountRaw,
                    transfer.amount,
                    transfer.txHash,
                    transfer.blockNumber,
                    transfer.eventIndex,
                    transfer.timestamp,
                    transferUid,
                    new Date().toISOString()
                )
                .run();


        return {
            inserted:
                result.meta?.changes === 1,

            transferUid
        };
    }
}
