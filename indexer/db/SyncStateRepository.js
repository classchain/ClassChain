export class SyncStateRepository {

    constructor(db) {

        if (!db) {
            throw new Error('D1 database is required');
        }

        this.db = db;
    }


    async get(treasuryId) {

        const result =
            await this.db
                .prepare(`
                    SELECT *
                    FROM sync_state
                    WHERE treasury_id = ?
                    LIMIT 1
                `)
                .bind(treasuryId)
                .first();

        return result || null;
    }


    async initialize(
        treasuryId,
        scanFromBlock = 0
    ) {

        await this.db
            .prepare(`
                INSERT INTO sync_state (
                    treasury_id,
                    scan_from_block,
                    last_scanned_block,
                    last_finalized_block,
                    last_sync_at,
                    status,
                    error
                )
                VALUES (?, ?, 0, 0, NULL, 'PENDING', NULL)
                ON CONFLICT (treasury_id)
                DO NOTHING
            `)
            .bind(
                treasuryId,
                scanFromBlock
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

    /**
     * Rewind scan cursor so the next sync re-reads from toBlock.
     * Used for recovery when TronGrid lag / partial runs missed transfers.
     */
    async rewind(
        treasuryId,
        toBlock
    ) {

        if (!treasuryId) {
            throw new Error('treasuryId is required');
        }

        if (!Number.isInteger(toBlock) || toBlock < 0) {
            throw new Error('toBlock must be a non-negative integer');
        }

        await this.db
            .prepare(`
                UPDATE sync_state
                SET
                    last_scanned_block = ?,
                    last_finalized_block = ?,
                    status = 'PENDING',
                    error = NULL,
                    last_sync_at = ?
                WHERE treasury_id = ?
            `)
            .bind(
                toBlock,
                toBlock,
                new Date().toISOString(),
                treasuryId
            )
            .run();

        return this.get(treasuryId);
    }
}
