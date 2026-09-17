/**
 * AllocationQueueRepository
 *
 * FIFO queue of unallocated contribution slices.
 * Each successful GENERAL transfer becomes one queue row.
 */

export class AllocationQueueRepository {

    constructor(db) {
        if (!db) {
            throw new Error('D1 database is required');
        }
        this.db = db;
    }

    /**
     * Enqueue a new contribution slice.
     * Idempotent via transfer_uid unique index.
     */
    async enqueue({
        donor,
        networkId,
        amountRaw,
        contributionTxHash,
        contributionTimestamp,
        transferUid
    }) {
        if (!donor || !networkId || !amountRaw) {
            throw new Error('donor, networkId and amountRaw are required');
        }

        const now = new Date().toISOString();
        const ts = Number(contributionTimestamp) || Math.floor(Date.now() / 1000);

        // Prefer INSERT OR IGNORE so idempotency works even when transfer_uid is null
        // (multiple nulls are allowed by SQLite UNIQUE). When transfer_uid is set,
        // the unique index prevents duplicates.
        const result = await this.db
            .prepare(`
                INSERT OR IGNORE INTO allocation_queue (
                    donor,
                    network_id,
                    amount_raw,
                    remaining_raw,
                    contribution_tx_hash,
                    contribution_timestamp,
                    status,
                    transfer_uid,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
            `)
            .bind(
                donor,
                networkId,
                String(amountRaw),
                String(amountRaw),
                contributionTxHash || null,
                ts,
                transferUid || null,
                now
            )
            .run();

        return {
            inserted: result.meta?.changes === 1
        };
    }

    /**
     * Peek the next OPEN / PARTIAL entries in FIFO order.
     */
    async peekOpen(limit = 50, networkId = null) {
        let query = `
            SELECT *
            FROM allocation_queue
            WHERE status IN ('OPEN', 'PARTIAL')
              AND CAST(remaining_raw AS INTEGER) > 0
        `;
        const binds = [];

        if (networkId) {
            query += ` AND network_id = ?`;
            binds.push(networkId);
        }

        query += `
            ORDER BY contribution_timestamp ASC, id ASC
            LIMIT ?
        `;
        binds.push(limit);

        const result = await this.db.prepare(query).bind(...binds).all();
        return result.results || [];
    }

    async getById(id) {
        return await this.db
            .prepare(`SELECT * FROM allocation_queue WHERE id = ? LIMIT 1`)
            .bind(id)
            .first();
    }

    /**
     * Reduce remaining_raw after partial / full allocation (Phase 2).
     */
    async reduceRemaining(id, amountRaw) {
        const amount = BigInt(String(amountRaw));
        const row = await this.getById(id);
        if (!row) {
            throw new Error(`Queue entry ${id} not found`);
        }

        const remaining = BigInt(row.remaining_raw);
        if (amount > remaining) {
            throw new Error(`Cannot allocate ${amount} from remaining ${remaining}`);
        }

        const newRemaining = remaining - amount;
        const status = newRemaining === 0n ? 'FULL' : 'PARTIAL';
        const now = new Date().toISOString();

        await this.db
            .prepare(`
                UPDATE allocation_queue
                SET remaining_raw = ?, status = ?, created_at = created_at
                WHERE id = ?
            `)
            .bind(String(newRemaining), status, id)
            .run();

        return this.getById(id);
    }
}
