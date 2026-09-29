/**
 * ContributionLedgerService
 *
 * Bridges the Indexer (raw transfers) and the contribution layer.
 *
 * Rule:
 * - Indexer only records blockchain truth.
 * - This service interprets GENERAL treasury transfers as
 *   unallocated contributions and maintains the FIFO queue.
 *
 * Failures in this service must NOT break the Indexer.
 */

import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';
import { AllocationQueueRepository } from '../db/AllocationQueueRepository.js';

export const GENERAL_PROJECT_ID = 'GENERAL_POOL';

export class ContributionLedgerService {

    constructor(db) {
        if (!db) {
            throw new Error('D1 database is required');
        }
        this.balanceRepo = new ContributionBalanceRepository(db);
        this.queueRepo = new AllocationQueueRepository(db);
    }

    /**
     * Called after a transfer was successfully inserted by TransferRepository.
     * Only acts when projectId === GENERAL_POOL.
     *
     * @returns {{ processed: boolean, reason?: string }}
     */
    async onTransferInserted(transfer) {
        if (!transfer) {
            return { processed: false, reason: 'no_transfer' };
        }

        const projectId = String(transfer.projectId || transfer.project_id || '');
        if (projectId !== GENERAL_PROJECT_ID) {
            return { processed: false, reason: 'not_general' };
        }

        const donor = transfer.donor;
        const networkId = transfer.networkId || transfer.network_id;
        const amountRaw = transfer.amountRaw || transfer.amount_raw;
        const timestamp = transfer.timestamp;
        const txHash = transfer.txHash || transfer.tx_hash;
        const transferUid = transfer.transferUid || transfer.transfer_uid;

        if (!donor || !networkId || !amountRaw) {
            return { processed: false, reason: 'missing_fields' };
        }

        // 1. Credit aggregated balance
        await this.balanceRepo.credit({
            donor,
            networkId,
            amountRaw,
            timestamp
        });

        // 2. Enqueue FIFO slice (idempotent via transfer_uid)
        const enqueueResult = await this.queueRepo.enqueue({
            donor,
            networkId,
            amountRaw,
            contributionTxHash: txHash,
            contributionTimestamp: timestamp,
            transferUid
        });

        return {
            processed: true,
            enqueued: enqueueResult.inserted
        };
    }

    /**
     * Public read API helpers
     */
    async getContributor(donor, networkId) {
        const balance = await this.balanceRepo.get(donor, networkId);
        if (!balance) {
            return {
                donor,
                networkId,
                total_contributed: '0',
                total_allocated: '0',
                unallocated: '0',
                first_at: null,
                last_at: null,
                in_contributor_community: false
            };
        }

        const unallocated = BigInt(balance.unallocated || '0');
        return {
            ...balance,
            in_contributor_community: unallocated > 0n
        };
    }

    async getQueue(limit = 50, networkId = null) {
        return this.queueRepo.peekOpen(limit, networkId);
    }

    async listContributors(networkId = null, limit = 100) {
        return this.balanceRepo.listContributorsWithUnallocated(networkId, limit);
    }
}
