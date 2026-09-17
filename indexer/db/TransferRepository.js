/**
 * TransferRepository — patched for Phase 1
 *
 * Changes vs original:
 * - Optional contributionLedgerService injected in constructor
 * - After a successful insert of a GENERAL transfer, calls the ledger
 * - Ledger failures are logged but never fail the insert
 *
 * Drop-in replacement for indexer/db/TransferRepository.js
 */

import { TransferIdentity } from '../core/dedup/TransferIdentity.js';

export class TransferRepository {

    constructor(db, contributionLedgerService = null) {
        if (!db) {
            throw new Error('D1 database is required');
        }
        this.db = db;
        this.contributionLedgerService = contributionLedgerService;
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

        const inserted = result.meta?.changes === 1;

        // Phase 1 hook: interpret GENERAL transfers (non-blocking)
        if (inserted && this.contributionLedgerService) {
            try {
                await this.contributionLedgerService.onTransferInserted({
                    ...transfer,
                    transferUid
                });
            } catch (err) {
                // Never break the Indexer
                console.error(JSON.stringify({
                    type: 'contribution_ledger.error',
                    transferUid,
                    projectId: transfer.projectId,
                    error: err instanceof Error ? err.message : String(err)
                }));
            }
        }

        return {
            inserted,
            transferUid
        };
    }
}
