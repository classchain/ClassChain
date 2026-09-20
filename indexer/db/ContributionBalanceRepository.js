/**
 * ContributionBalanceRepository
 *
 * Tracks aggregated USDT balances per donor in the GENERAL treasury.
 * All amounts are stored as decimal strings (no floating point).
 */

export class ContributionBalanceRepository {

    constructor(db) {
        if (!db) {
            throw new Error('D1 database is required');
        }
        this.db = db;
    }

    async get(donor, networkId) {
        const row = await this.db
            .prepare(`
                SELECT *
                FROM contribution_balances
                WHERE donor = ? AND network_id = ?
                LIMIT 1
            `)
            .bind(donor, networkId)
            .first();

        return row || null;
    }

    /**
     * Credit a new contribution (called when a GENERAL transfer is inserted).
     * amountRaw must be a positive integer string (token base units).
     */
    async credit({ donor, networkId, amountRaw, timestamp }) {
        if (!donor || !networkId || !amountRaw) {
            throw new Error('donor, networkId and amountRaw are required');
        }

        const now = new Date().toISOString();
        const ts = Number(timestamp) || Math.floor(Date.now() / 1000);

        // Upsert: add to total_contributed and unallocated
        await this.db
            .prepare(`
                INSERT INTO contribution_balances (
                    donor,
                    network_id,
                    total_contributed,
                    total_allocated,
                    unallocated,
                    first_at,
                    last_at,
                    updated_at
                )
                VALUES (?, ?, ?, '0', ?, ?, ?, ?)
                ON CONFLICT (donor, network_id) DO UPDATE SET
                    total_contributed = CAST(
                        (CAST(total_contributed AS INTEGER) + CAST(excluded.total_contributed AS INTEGER))
                        AS TEXT
                    ),
                    unallocated = CAST(
                        (CAST(unallocated AS INTEGER) + CAST(excluded.unallocated AS INTEGER))
                        AS TEXT
                    ),
                    last_at = excluded.last_at,
                    updated_at = excluded.updated_at,
                    first_at = COALESCE(contribution_balances.first_at, excluded.first_at)
            `)
            .bind(
                donor,
                networkId,
                String(amountRaw),
                String(amountRaw),
                ts,
                ts,
                now
            )
            .run();

        return this.get(donor, networkId);
    }

    /**
     * Debit unallocated balance after an allocation (Phase 2).
     * Kept here so the repository interface is complete.
     */
    async debitUnallocated({ donor, networkId, amountRaw }) {
        const now = new Date().toISOString();

        await this.db
            .prepare(`
                UPDATE contribution_balances
                SET
                    unallocated = CAST(
                        (CAST(unallocated AS INTEGER) - CAST(? AS INTEGER))
                        AS TEXT
                    ),
                    total_allocated = CAST(
                        (CAST(total_allocated AS INTEGER) + CAST(? AS INTEGER))
                        AS TEXT
                    ),
                    updated_at = ?
                WHERE donor = ? AND network_id = ?
                  AND CAST(unallocated AS INTEGER) >= CAST(? AS INTEGER)
            `)
            .bind(
                String(amountRaw),
                String(amountRaw),
                now,
                donor,
                networkId,
                String(amountRaw)
            )
            .run();

        return this.get(donor, networkId);
    }

    async getTotalUnallocated(donor) {
        const row = await this.db
            .prepare(`
                SELECT COALESCE(SUM(CAST(unallocated AS INTEGER)), 0) AS total
                FROM contribution_balances
                WHERE donor = ?
            `)
            .bind(donor)
            .first();

        return BigInt(String(row?.total || '0'));
    }

    async listContributorsWithUnallocated(networkId = null, limit = 100) {
        let query = `
            SELECT *
            FROM contribution_balances
            WHERE CAST(unallocated AS INTEGER) > 0
        `;
        const binds = [];

        if (networkId) {
            query += ` AND network_id = ?`;
            binds.push(networkId);
        }

        query += ` ORDER BY first_at ASC LIMIT ?`;
        binds.push(limit);

        const result = await this.db.prepare(query).bind(...binds).all();
        return result.results || [];
    }
}
