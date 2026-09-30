export class SyncStateRepository {

    constructor(db) {

        if (!db) {
            throw new Error('Database is required');
        }

        this.db = db;
    }


    async get(treasuryId) {

        return this.db
            .prepare(`
                SELECT *
                FROM sync_state
                WHERE treasury_id = ?
            `)
            .bind(treasuryId)
            .first();
    }


    async initialize(
        treasuryId,
        scanFromBlock = 0
    ) {

        const start =
            Number.isInteger(scanFromBlock) &&
            scanFromBlock >= 0
                ? scanFromBlock
                : 0;

        await this.db
            .prepare(`
                INSERT OR IGNORE INTO sync_state (
                    treasury_id,
                    last_scanned_block,
                    last_finalized_block,
                    last_sync_at,
                    status,
                    error
                ) VALUES (?, ?, ?, NULL, 'PENDING', NULL)
            `)
            .bind(
                treasuryId,
                Math.max(0, start - 1),
                Math.max(0, start - 1)
            )
            .run();

        return this.get(treasuryId);
    }


    async markSuccess(
        treasuryId,
        lastScannedBlock,
        lastFinalizedBlock
    ) {

        await this.db
            .prepare(`
                UPDATE sync_state
                SET
                    last_scanned_block = ?,
                    last_finalized_block = ?,
                    last_sync_at = ?,
                    status = 'SUCCESS',
                    error = NULL
                WHERE treasury_id = ?
            `)
            .bind(
                lastScannedBlock,
                lastFinalizedBlock,
                new Date().toISOString(),
                treasuryId
            )
            .run();
    }


    async markFailed(
        treasuryId,
        error
    ) {

        await this.db
            .prepare(`
                UPDATE sync_state
                SET
                    last_sync_at = ?,
                    status = 'FAILED',
                    error = ?
                WHERE treasury_id = ?
            `)
            .bind(
                new Date().toISOString(),
                String(error),
                treasuryId
            )
            .run();
    }


    async markDeferred(
        treasuryId,
        error
    ) {

        await this.db
            .prepare(`
                UPDATE sync_state
                SET
                    status = 'DEFERRED',
                    error = ?
                WHERE treasury_id = ?
            `)
            .bind(
                String(error),
                treasuryId
            )
            .run();
    }
}
