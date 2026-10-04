/**
 * AllocationRepository — records FIFO allocations to projects.
 *
 * status:
 *   PLANNED   — plan only (queue/balance untouched)
 *   COMMITTED — after on-chain EXECUTED (queue reduced + unallocated debited)
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
        allocatedAt,
        status = 'COMMITTED',
    }) {
        const now = new Date().toISOString();
        const ts = Number(allocatedAt) || Math.floor(Date.now() / 1000);
        const st = status === 'PLANNED' ? 'PLANNED' : 'COMMITTED';

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
                    created_at,
                    status
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
                now,
                st
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

    async listPlannedByBatchAndNetwork(allocationBatchId, networkId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM allocations
                WHERE allocation_batch_id = ?
                  AND network_id = ?
                  AND status = 'PLANNED'
                ORDER BY id ASC
            `)
            .bind(allocationBatchId, networkId)
            .all();
        return result.results || [];
    }

    async markCommitted(id) {
        await this.db
            .prepare(`
                UPDATE allocations
                SET status = 'COMMITTED',
                    allocated_at = ?
                WHERE id = ? AND status = 'PLANNED'
            `)
            .bind(Math.floor(Date.now() / 1000), id)
            .run();
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
                  AND status = 'COMMITTED'
            `)
            .bind(projectId)
            .first();
        return String(row?.total ?? 0);
    }

    async countPlannedByBatch(allocationBatchId) {
        const row = await this.db
            .prepare(`
                SELECT COUNT(*) AS c FROM allocations
                WHERE allocation_batch_id = ? AND status = 'PLANNED'
            `)
            .bind(allocationBatchId)
            .first();
        return Number(row?.c || 0);
    }
}
