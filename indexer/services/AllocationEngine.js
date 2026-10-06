/**
 * AllocationEngine — FIFO allocation from public pool to a selected project.
 *
 * Rules:
 * - Consumes allocation_queue in contribution_timestamp order
 * - Vote preference is NOT used here (allocation is independent of votes)
 * - Manual confirmation: only runs when explicitly invoked (admin)
 *
 * commitBalances:
 * - true (default): debit contribution_balances immediately (legacy / direct allocate)
 * - false: reserve FIFO capacity + record PLANNED allocation rows; balances and queue
 *          remain unchanged until every related on-chain disbursement is EXECUTED
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
     * @param {string[]|null} params.networkIds  allowed treasury networks for the selected project
     * @param {boolean} [params.commitBalances=true]  when false, do not debit unallocated yet
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

        while (remainingNeeded > 0n) {
            const openEntries = await this.queueRepo.peekOpen(
                500,
                null,
                allowedNetworks ? [...allowedNetworks] : null
            );

            if (!openEntries.length) break;

            for (const entry of openEntries) {
                if (remainingNeeded <= 0n) break;

                const available = BigInt(entry.available_raw ?? entry.remaining_raw);
                if (available <= 0n) continue;

                const take = available < remainingNeeded ? available : remainingNeeded;

                // Planning reserves capacity through the allocation row itself.
                // Queue remaining and balances are consumed only after on-chain execution.

                // Record allocation plan / slice
                await this.allocationRepo.insert({
                    queueEntryId: entry.id,
                    projectId,
                    donor: entry.donor,
                    networkId: entry.network_id,
                    amountRaw: String(take),
                    allocationBatchId: batchId,
                    allocatedAt
                });

                slices.push({
                    queue_entry_id: entry.id,
                    donor: entry.donor,
                    network_id: entry.network_id,
                    amount_raw: String(take)
                });

                remainingNeeded -= take;
            }
        }

        if (commitBalances !== false && slices.length) {
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
     * Commit balance debits for a previously planned batch (commitBalances=false path).
     */
    async commitBatchBalances(allocationBatchId) {
        return this.allocationRepo.commitBatch(allocationBatchId);
    }

    async releaseBatch(allocationBatchId) {
        return this.allocationRepo.releaseBatch(allocationBatchId);
    }
}
