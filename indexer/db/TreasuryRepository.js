export class TreasuryRepository {

    constructor(db) {
        if (!db) {
            throw new Error('D1 database is required');
        }

        this.db = db;
    }


    async findByIdentity(
        projectId,
        networkId,
        address
    ) {

        const result =
            await this.db
                .prepare(`
                    SELECT *
                    FROM treasuries
                    WHERE project_id = ?
                      AND network_id = ?
                      AND address = ?
                    LIMIT 1
                `)
                .bind(
                    projectId,
                    networkId,
                    address
                )
                .first();

        return result || null;
    }


    async upsert(treasury) {

        const now =
            new Date().toISOString();

        await this.db
            .prepare(`
                INSERT INTO treasuries (
                    project_id,
                    network_id,
                    address,
                    active,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)

                ON CONFLICT (
                    project_id,
                    network_id,
                    address
                )
                DO UPDATE SET
                    active = excluded.active,
                    updated_at = excluded.updated_at
            `)
            .bind(
                treasury.projectId,
                treasury.networkId,
                treasury.address,
                treasury.active === false ? 0 : 1,
                treasury.createdAt || now,
                now
            )
            .run();


        return this.findByIdentity(
            treasury.projectId,
            treasury.networkId,
            treasury.address
        );
    }
}
