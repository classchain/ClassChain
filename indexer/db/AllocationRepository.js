/**
 * AllocationRepository — records FIFO allocations to projects.
 */

export class AllocationRepository {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
    }

    async insert({
        queueEntryId,
        projectId,
        donor,
        networkId,
        amountRaw,
        allocationBatchId,
        allocatedAt
    }) {
        const now = new Date().toISOString();
        const ts = Number(allocatedAt) || Math.floor(Date.now() / 1000);

        const result = await this.db
            .prepare(`
                INSERT INTO allocations (
                    queue_entry_id,
                    project_id,
                    donor,
                    network_id,
                    amount_raw,
                    allocation_batch_id,
                    allocated_at,
                    allocation_status,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
                queueEntryId,
                projectId,
                donor,
                networkId,
                String(amountRaw),
                allocationBatchId,
                ts,
                'PLANNED',
                now
            )
            .run();

        return { id: result.meta?.last_row_id, inserted: result.meta?.changes === 1 };
    }

    async listByBatch(allocationBatchId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM allocations
                WHERE allocation_batch_id = ?
                ORDER BY id ASC
            `)
            .bind(allocationBatchId)
            .all();
        return result.results || [];
    }

    async countPlannedByBatch(allocationBatchId) {
        const row = await this.db
            .prepare(`
                SELECT COUNT(*) AS c FROM allocations
                WHERE allocation_batch_id = ?
                  AND allocation_status = 'PLANNED'
            `)
            .bind(allocationBatchId)
            .first();
        return Number(row?.c || 0);
    }

    /**
     * Commit only the PLANNED slices of one network inside a batch.
     * Queue and balance values are stored as decimal TEXT, so all arithmetic is
     * done with BigInt in JavaScript (never SQLite's signed 64-bit CAST arithmetic).
     */
    async commitNetwork(allocationBatchId, networkId) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        if (!networkId) throw new Error('networkId is required');

        const slices = await this.listByBatch(allocationBatchId);
        const planned = slices.filter(
            (slice) =>
                String(slice.allocation_status ?? 'PLANNED') === 'PLANNED' &&
                String(slice.network_id) === String(networkId)
        );

        if (!planned.length) {
            return {
                ok: true,
                allocation_batch_id: allocationBatchId,
                network_id: networkId,
                committed_slices: 0,
                message: 'no planned slices for network',
            };
        }

        return this._commitPlanned(allocationBatchId, planned, networkId);
    }

    /**
     * Commit PLANNED slices across all networks (legacy/direct-allocation path).
     * Uses the same guarded and exact-arithmetic transaction as commitNetwork.
     */
    async commitBatch(allocationBatchId) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');

        const slices = await this.listByBatch(allocationBatchId);
        const planned = slices.filter(
            (slice) => String(slice.allocation_status ?? 'PLANNED') === 'PLANNED'
        );

        if (!planned.length) {
            return {
                ok: true,
                allocation_batch_id: allocationBatchId,
                committed_slices: 0,
            };
        }

        return this._commitPlanned(allocationBatchId, planned, null);
    }

    _parseRaw(value, label) {
        const raw = String(value ?? '');
        if (!/^\\d+$/.test(raw)) {
            throw new Error(`${label} must be a non-negative integer string`);
        }
        return BigInt(raw);
    }

    async _commitPlanned(allocationBatchId, planned, networkId) {
        const queueTotals = new Map();
        const balanceTotals = new Map();

        for (const slice of planned) {
            const amount = this._parseRaw(slice.amount_raw, `allocation ${slice.id} amount_raw`);
            if (amount <= 0n) {
                throw new Error(`allocation ${slice.id} amount_raw must be greater than zero`);
            }

            const queueId = Number(slice.queue_entry_id);
            if (!Number.isSafeInteger(queueId) || queueId <= 0) {
                throw new Error(`allocation ${slice.id} has an invalid queue_entry_id`);
            }
            const donor = String(slice.donor || '');
            const sliceNetwork = String(slice.network_id || '');
            if (!donor || !sliceNetwork) {
                throw new Error(`allocation ${slice.id} is missing donor or network_id`);
            }

            const queueTotal = queueTotals.get(queueId) || {
                amount: 0n,
                donor,
                networkId: sliceNetwork,
            };
            if (queueTotal.donor !== donor || queueTotal.networkId !== sliceNetwork) {
                throw new Error(
                    `allocations referencing queue entry ${queueId} disagree on donor or network_id`
                );
            }
            queueTotal.amount += amount;
            queueTotals.set(queueId, queueTotal);

            const balanceKey = JSON.stringify([donor, sliceNetwork]);
            const balance = balanceTotals.get(balanceKey) || {
                donor,
                networkId: sliceNetwork,
                amount: 0n,
            };
            balance.amount += amount;
            balanceTotals.set(balanceKey, balance);
        }

        // Read the current snapshot and calculate exact next values with BigInt.
        // The UPDATEs below compare against this snapshot; a concurrent change
        // causes a constraint failure inside D1's batch transaction and rolls
        // the whole batch back instead of silently committing a partial ledger.
        const queueSnapshots = new Map();
        for (const [queueId, queueTotal] of queueTotals) {
            const queue = await this.db
                .prepare('SELECT remaining_raw, donor, network_id FROM allocation_queue WHERE id = ? LIMIT 1')
                .bind(queueId)
                .first();
            if (!queue) throw new Error(`Queue entry ${queueId} not found`);
            if (
                String(queue.donor || '') !== queueTotal.donor ||
                String(queue.network_id || '') !== queueTotal.networkId
            ) {
                throw new Error(
                    `Queue entry ${queueId} donor/network does not match its planned allocation slices`
                );
            }

            const amount = queueTotal.amount;
            const remaining = this._parseRaw(queue.remaining_raw, `queue entry ${queueId} remaining_raw`);
            if (amount > remaining) {
                throw new Error(`Cannot commit ${amount} from queue entry ${queueId}; remaining ${remaining}`);
            }
            queueSnapshots.set(queueId, {
                remaining: String(queue.remaining_raw),
                next: String(remaining - amount),
                status: remaining === amount ? 'FULL' : 'PARTIAL',
            });
        }

        const balanceSnapshots = new Map();
        for (const [key, balance] of balanceTotals) {
            const row = await this.db
                .prepare(
                    'SELECT unallocated, total_allocated FROM contribution_balances WHERE donor = ? AND network_id = ? LIMIT 1'
                )
                .bind(balance.donor, balance.networkId)
                .first();
            if (!row) {
                throw new Error(
                    `Contribution balance not found for donor ${balance.donor} on ${balance.networkId}`
                );
            }

            const unallocated = this._parseRaw(
                row.unallocated,
                `contribution balance ${balance.donor}/${balance.networkId} unallocated`
            );
            const totalAllocated = this._parseRaw(
                row.total_allocated,
                `contribution balance ${balance.donor}/${balance.networkId} total_allocated`
            );
            if (balance.amount > unallocated) {
                throw new Error(
                    `Cannot commit ${balance.amount} for donor ${balance.donor} on ${balance.networkId}; unallocated ${unallocated}`
                );
            }

            balanceSnapshots.set(key, {
                ...balance,
                unallocated: String(row.unallocated),
                totalAllocated: String(row.total_allocated),
                nextUnallocated: String(unallocated - balance.amount),
                nextTotalAllocated: String(totalAllocated + balance.amount),
            });
        }

        const statements = [];
        const anchorAllocationId = planned[0]?.id;
        if (!Number.isSafeInteger(Number(anchorAllocationId)) || Number(anchorAllocationId) <= 0) {
            throw new Error('planned allocation has an invalid id');
        }

        // Each write is immediately followed by a sentinel UPDATE. If the
        // preceding conditional UPDATE touches zero rows, changes() is zero and
        // the sentinel violates allocation_status NOT NULL. D1 then rolls the
        // entire batch back, including earlier queue/balance writes.
        const appendChecked = (statement) => {
            statements.push(statement);
            statements.push(
                this.db.prepare(
                    `UPDATE allocations
                     SET allocation_status = CASE WHEN changes() = 1 THEN allocation_status ELSE NULL END
                     WHERE id = ?`
                ).bind(anchorAllocationId)
            );
        };

        // 1. Reduce remaining amounts in the FIFO queue using exact string CAS.
        for (const [queueId] of queueTotals) {
            const snapshot = queueSnapshots.get(queueId);
            appendChecked(
                this.db.prepare(
                    `UPDATE allocation_queue
                     SET remaining_raw = CASE WHEN remaining_raw = ? THEN ? ELSE NULL END,
                         status = CASE WHEN remaining_raw = ? THEN ? ELSE NULL END
                     WHERE id = ?`
                ).bind(
                    snapshot.remaining,
                    snapshot.next,
                    snapshot.remaining,
                    snapshot.status,
                    queueId
                )
            );
        }

        // 2. Debit each donor/network balance once, even when a batch contains
        // multiple FIFO slices from the same donor on the same network.
        const updatedAt = new Date().toISOString();
        for (const [key, snapshot] of balanceSnapshots) {
            appendChecked(
                this.db.prepare(
                    `UPDATE contribution_balances
                     SET unallocated = CASE
                             WHEN unallocated = ? AND total_allocated = ? THEN ? ELSE NULL
                         END,
                         total_allocated = CASE
                             WHEN unallocated = ? AND total_allocated = ? THEN ? ELSE NULL
                         END,
                         updated_at = ?
                     WHERE donor = ? AND network_id = ?`
                ).bind(
                    snapshot.unallocated,
                    snapshot.totalAllocated,
                    snapshot.nextUnallocated,
                    snapshot.unallocated,
                    snapshot.totalAllocated,
                    snapshot.nextTotalAllocated,
                    updatedAt,
                    snapshot.donor,
                    snapshot.networkId
                )
            );
        }

        // 3. Commit the planned slices. A concurrent status/batch change raises a
        // NOT NULL constraint error and rolls back all earlier writes in this batch.
        for (const slice of planned) {
            appendChecked(
                this.db.prepare(
                    `UPDATE allocations
                     SET allocation_status = CASE
                         WHEN allocation_status = 'PLANNED' AND allocation_batch_id = ?
                         THEN 'COMMITTED' ELSE NULL END
                     WHERE id = ?`
                ).bind(allocationBatchId, slice.id)
            );
        }

        const results = await this.db.batch(statements);
        if (!Array.isArray(results) || results.length !== statements.length) {
            throw new Error('D1 did not return a result for every allocation ledger update');
        }
        for (let index = 0; index < results.length; index += 1) {
            if (Number(results[index]?.meta?.changes) !== 1) {
                throw new Error(
                    `Allocation ledger update ${index + 1} affected ${results[index]?.meta?.changes ?? 'an unknown number of'} rows; reconciliation is required`
                );
            }
        }

        return {
            ok: true,
            allocation_batch_id: allocationBatchId,
            network_id: networkId,
            committed_slices: planned.length,
            committed_amount_raw: planned
                .reduce((total, slice) => total + this._parseRaw(slice.amount_raw, `allocation ${slice.id} amount_raw`), 0n)
                .toString(),
        };
    }

    async releaseBatch(allocationBatchId) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        const result = await this.db.prepare(
            `UPDATE allocations SET allocation_status = 'RELEASED'
             WHERE allocation_batch_id = ? AND allocation_status = 'PLANNED'`
        ).bind(allocationBatchId).run();
        return { ok: true, allocation_batch_id: allocationBatchId, released_slices: result.meta?.changes || 0 };
    }

    async listByProject(projectId, limit = 100) {
        const result = await this.db
            .prepare(`
                SELECT * FROM allocations
                WHERE project_id = ?
                ORDER BY allocated_at DESC, id DESC
                LIMIT ?
            `)
            .bind(projectId, limit)
            .all();
        return result.results || [];
    }

    async sumByProject(projectId) {
        const row = await this.db
            .prepare(`
                SELECT COALESCE(SUM(CAST(amount_raw AS INTEGER)), 0) AS total
                FROM allocations
                WHERE project_id = ?
            `)
            .bind(projectId)
            .first();
        return String(row?.total ?? 0);
    }
}
