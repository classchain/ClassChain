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

    async commitBatch(allocationBatchId) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        const slices = await this.listByBatch(allocationBatchId);
        const planned = slices.filter((s) => String(s.allocation_status || 'PLANNED') === 'PLANNED');
        if (!planned.length) return { ok: true, allocation_batch_id: allocationBatchId, committed_slices: 0 };

        const queueTotals = new Map();
        for (const s of planned) {
            const id = Number(s.queue_entry_id);
            queueTotals.set(id, (queueTotals.get(id) || 0n) + BigInt(String(s.amount_raw || '0')));
        }

        const statements = [];
        for (const [queueId, amount] of queueTotals) {
            const queue = await this.db.prepare(
                'SELECT remaining_raw FROM allocation_queue WHERE id = ? LIMIT 1'
            ).bind(queueId).first();
            if (!queue) throw new Error(`Queue entry ${queueId} not found`);
            const remaining = BigInt(String(queue.remaining_raw || '0'));
            if (amount > remaining) {
                throw new Error(`Cannot commit ${amount} from queue entry ${queueId}; remaining ${remaining}`);
            }
            const next = remaining - amount;
            const status = next === 0n ? 'FULL' : 'PARTIAL';
            statements.push(this.db.prepare(
                `UPDATE allocation_queue
                 SET remaining_raw = ?, status = ?
                 WHERE id = ? AND CAST(remaining_raw AS INTEGER) >= CAST(? AS INTEGER)`
            ).bind(String(next), status, queueId, String(amount)));
        }

        for (const s of planned) {
            statements.push(this.db.prepare(
                `UPDATE contribution_balances
                 SET unallocated = CAST((CAST(unallocated AS INTEGER) - CAST(? AS INTEGER)) AS TEXT),
                     total_allocated = CAST((CAST(total_allocated AS INTEGER) + CAST(? AS INTEGER)) AS TEXT),
                     updated_at = ?
                 WHERE donor = ? AND network_id = ?
                   AND CAST(unallocated AS INTEGER) >= CAST(? AS INTEGER)`
            ).bind(
                String(s.amount_raw), String(s.amount_raw), new Date().toISOString(),
                s.donor, s.network_id, String(s.amount_raw)
            ));
        }

        for (const s of planned) {
            statements.push(this.db.prepare(
                `UPDATE allocations SET allocation_status = 'COMMITTED'
                 WHERE id = ? AND allocation_status = 'PLANNED'`
            ).bind(s.id));
        }

        await this.db.batch(statements);
        return { ok: true, allocation_batch_id: allocationBatchId, committed_slices: planned.length };
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
