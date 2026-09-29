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
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .bind(
                queueEntryId,
                projectId,
                donor,
                networkId,
                String(amountRaw),
                allocationBatchId,
                ts,
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
