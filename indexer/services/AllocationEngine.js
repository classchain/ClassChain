/**
 * AllocationEngine — FIFO allocation from public pool to a selected project.
 *
 * Two-phase flow (money-first):
 *   1) plan()     — compute FIFO slices + write PLANNED allocation rows
 *                   DOES NOT touch allocation_queue remaining or balances
 *   2) commitNetwork() — after on-chain disburse EXECUTED for a network:
 *                   reduce queue, debit unallocated, mark slices COMMITTED
 *
 * Legacy allocate() still commits immediately (direct /api/allocate).
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
     * Plan FIFO slices without consuming queue or balances.
     * Writes allocation rows with status=PLANNED for disbursement packaging.
     */
    async plan({ projectId, requiredAmountRaw, networkIds = null, networkId = null }) {
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

        // Snapshot of remaining per queue entry so we do not over-plan the same row
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

                const liveRemaining = BigInt(entry.remaining_raw);
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
                    allocatedAt,
                    status: 'PLANNED',
                });

                remainingByEntry.set(entry.id, alreadyPlanned + take);

                slices.push({
                    queue_entry_id: entry.id,
                    donor: entry.donor,
                    network_id: entry.network_id,
                    amount_raw: String(take),
                });

                remainingNeeded -= take;
                progressed = true;
            }

            if (!progressed) break;
        }

        const totalPlanned = BigInt(String(requiredAmountRaw)) - remainingNeeded;

        return {
            ok: true,
            planned: true,
            committed: false,
            project_id: projectId,
            allocation_batch_id: batchId,
            required_amount_raw: String(requiredAmountRaw),
            allocated_amount_raw: String(totalPlanned),
            shortfall_raw: String(remainingNeeded),
            fully_funded: remainingNeeded === 0n,
            slices_count: slices.length,
            slices,
        };
    }

    /**
     * Commit PLANNED slices for one network after on-chain EXECUTED.
     * Reduces queue remaining and debits unallocated balances.
     */
    async commitNetwork({ allocationBatchId, networkId }) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        if (!networkId) throw new Error('networkId is required');

        const planned = await this.allocationRepo.listPlannedByBatchAndNetwork(
            allocationBatchId,
            networkId
        );

        if (!planned.length) {
            return { ok: true, committed_count: 0, message: 'no planned slices for network' };
        }

        const committed = [];

        for (const row of planned) {
            const take = String(row.amount_raw);

            await this.queueRepo.reduceRemaining(row.queue_entry_id, take);

            await this.balanceRepo.debitUnallocated({
                donor: row.donor,
                networkId: row.network_id,
                amountRaw: take,
            });

            await this.allocationRepo.markCommitted(row.id);

            committed.push({
                allocation_id: row.id,
                queue_entry_id: row.queue_entry_id,
                donor: row.donor,
                network_id: row.network_id,
                amount_raw: take,
            });
        }

        return {
            ok: true,
            allocation_batch_id: allocationBatchId,
            network_id: networkId,
            committed_count: committed.length,
            slices: committed,
        };
    }

    /**
     * Legacy: plan + immediate commit (direct /api/allocate).
     * Prefer plan() + commitNetwork() for voting rounds.
     */
    async allocate({ projectId, requiredAmountRaw, networkIds = null, networkId = null }) {
        const planned = await this.plan({
            projectId,
            requiredAmountRaw,
            networkIds,
            networkId,
        });

        const byNetwork = new Set(planned.slices.map((s) => s.network_id));
        for (const nid of byNetwork) {
            await this.commitNetwork({
                allocationBatchId: planned.allocation_batch_id,
                networkId: nid,
            });
        }

        return {
            ...planned,
            planned: false,
            committed: true,
        };
    }
}
