/**
 * AllocationEngine — FIFO allocation from public pool to a selected project.
 *
 * Rules:
 * - Consumes allocation_queue in contribution_timestamp order
 * - Vote preference is NOT used here (allocation is independent of votes)
 *
 * Two-phase flow (money-first):
 *   1) allocate(..., { commitBalances: false })  → write PLANNED rows only
 *      (queue remaining + unallocated balances stay untouched)
 *   2) commitNetwork() after on-chain disburse EXECUTED for that network:
 *      reduce queue, debit unallocated, mark those slices COMMITTED
 *
 * Overall allocation status stays incomplete until every required network
 * has been committed (or cancelled under the agreed rules).
 *
 * Legacy allocate() with commitBalances=true still commits immediately
 * (will later be forced through the secure disbursement path).
 */

import { AllocationQueueRepository } from '../db/AllocationQueueRepository.js';
import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';
import { AllocationRepository } from '../db/AllocationRepository.js';

function randomBatchId() {
    const a = Math.random().toString(16).slice(2);
    const b = Date.now().toString(16);
    return `batch_${b}_${a}`;
}

export class AllocationEngine {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.queueRepo = new AllocationQueueRepository(db);
        this.balanceRepo = new ContributionBalanceRepository(db);
        this.allocationRepo = new AllocationRepository(db);
    }

    /**
     * Allocate up to requiredAmountRaw from the FIFO queue to projectId.
     *
     * @param {object} params
     * @param {string} params.projectId
     * @param {string} params.requiredAmountRaw  integer string (base units)
     * @param {string[]|null} params.networkIds  allowed treasury networks
     * @param {boolean} [params.commitBalances=true]
     * @returns {Promise<object>} summary
     */
    async allocate({ projectId, requiredAmountRaw, networkIds = null, networkId = null, commitBalances = true }) {
        if (!projectId) throw new Error('projectId is required');
        if (!requiredAmountRaw || BigInt(String(requiredAmountRaw)) <= 0n) {
            throw new Error('requiredAmountRaw must be a positive integer string');
        }

        let remainingNeeded = BigInt(String(requiredAmountRaw));
        const batchId = randomBatchId();
        const allocatedAt = Math.floor(Date.now() / 1000);
        const slices = [];

        const resolvedNetworkIds = Array.isArray(networkIds) && networkIds.length
            ? networkIds
            : (networkId ? [networkId] : null);
        const allowedNetworks = resolvedNetworkIds ? new Set(resolvedNetworkIds) : null;

        // Snapshot so we do not over-plan the same queue entry inside one plan
        const remainingByEntry = new Map();

        while (remainingNeeded > 0n) {
            const openEntries = await this.queueRepo.peekOpen(
                500,
                null,
                allowedNetworks ? [...allowedNetworks] : null
            );

            if (!openEntries.length) break;

            let progressed = false;

            for (const entry of openEntries) {
                if (remainingNeeded <= 0n) break;

                const liveRemaining = BigInt(entry.available_raw ?? entry.remaining_raw);
                const alreadyPlanned = remainingByEntry.get(entry.id) || 0n;
                const available = liveRemaining - alreadyPlanned;
                if (available <= 0n) continue;

                const take = available < remainingNeeded ? available : remainingNeeded;

                await this.allocationRepo.insert({
                    queueEntryId: entry.id,
                    projectId,
                    donor: entry.donor,
                    networkId: entry.network_id,
                    amountRaw: String(take),
                    allocationBatchId: batchId,
                    allocatedAt
                });

                remainingByEntry.set(entry.id, alreadyPlanned + take);

                slices.push({
                    queue_entry_id: entry.id,
                    donor: entry.donor,
                    network_id: entry.network_id,
                    amount_raw: String(take)
                });

                remainingNeeded -= take;
                progressed = true;
            }

            if (!progressed) break;
        }

        if (commitBalances !== false && slices.length) {
            // Immediate full commit (legacy path)
            await this.allocationRepo.commitBatch(batchId);
        }

        const totalAllocated = BigInt(String(requiredAmountRaw)) - remainingNeeded;

        return {
            ok: true,
            project_id: projectId,
            allocation_batch_id: batchId,
            required_amount_raw: String(requiredAmountRaw),
            allocated_amount_raw: String(totalAllocated),
            shortfall_raw: String(remainingNeeded),
            fully_funded: remainingNeeded === 0n,
            balances_committed: commitBalances !== false,
            slices_count: slices.length,
            slices
        };
    }

    /**
     * Commit PLANNED slices for ONE network after on-chain EXECUTED.
     * Reduces queue remaining and debits unallocated for that network only.
     * Overall batch remains open until all networks are committed.
     */
    async commitNetwork({ allocationBatchId, networkId }) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        if (!networkId) throw new Error('networkId is required');

        return this.allocationRepo.commitNetwork(allocationBatchId, networkId);
    }

    /**
     * Commit all remaining PLANNED slices of a batch (legacy / full finalization).
     */
    async commitBatchBalances(allocationBatchId) {
        return this.allocationRepo.commitBatch(allocationBatchId);
    }

    async releaseBatch(allocationBatchId) {
        return this.allocationRepo.releaseBatch(allocationBatchId);
    }
}
