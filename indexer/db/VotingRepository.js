/**
 * VotingRepository — voting rounds and preference votes.
 * Vote Preference ≠ Financial Allocation.
 */

export class VotingRepository {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
    }

    async hasOpenRound() {
        const row = await this.db
            .prepare(`
                SELECT id FROM voting_rounds
                WHERE status = 'OPEN'
                LIMIT 1
            `)
            .first();
        return row ? row.id : null;
    }

    async createRound({
        title,
        candidateProjects,
        networkId = null
    }) {
        const now = new Date().toISOString();
        const openedAt = Math.floor(Date.now() / 1000);
        const candidatesJson = JSON.stringify(candidateProjects || []);

        const result = await this.db
            .prepare(`
                INSERT INTO voting_rounds (
                    title,
                    candidate_projects,
                    status,
                    network_id,
                    opened_at,
                    created_at
                ) VALUES (?, ?, 'OPEN', ?, ?, ?)
            `)
            .bind(title, candidatesJson, networkId, openedAt, now)
            .run();

        const id = result.meta?.last_row_id;
        return this.getRound(id);
    }

    async getRound(id) {
        const row = await this.db
            .prepare(`SELECT * FROM voting_rounds WHERE id = ? LIMIT 1`)
            .bind(id)
            .first();
        if (!row) return null;
        return this._normalizeRound(row);
    }

    async listRounds(limit = 20) {
        const result = await this.db
            .prepare(`
                SELECT * FROM voting_rounds
                ORDER BY id DESC
                LIMIT ?
            `)
            .bind(limit)
            .all();
        return (result.results || []).map(r => this._normalizeRound(r));
    }

    async closeRound(id, selectedProjectId, requiredAmountRaw) {
        const closedAt = Math.floor(Date.now() / 1000);
        await this.db
            .prepare(`
                UPDATE voting_rounds
                SET status = 'CLOSED',
                    selected_project_id = ?,
                    required_amount_raw = ?,
                    closed_at = ?
                WHERE id = ? AND status = 'OPEN'
            `)
            .bind(
                selectedProjectId,
                String(requiredAmountRaw),
                closedAt,
                id
            )
            .run();
        return this.getRound(id);
    }

    async markAllocated(id, allocationBatchId) {
        const allocatedAt = Math.floor(Date.now() / 1000);
        await this.db
            .prepare(`
                UPDATE voting_rounds
                SET status = 'ALLOCATED',
                    allocation_batch_id = ?,
                    allocated_at = ?
                WHERE id = ? AND status = 'CLOSED'
            `)
            .bind(allocationBatchId, allocatedAt, id)
            .run();
        return this.getRound(id);
    }

    async castVote({
        roundId,
        donor,
        networkId,
        projectId,
        telegramUserId = null
    }) {
        const now = new Date().toISOString();
        const votedAt = Math.floor(Date.now() / 1000);

        await this.db
            .prepare(`
                INSERT INTO votes (
                    round_id, donor, network_id, project_id,
                    telegram_user_id, voted_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(round_id, donor, network_id) DO UPDATE SET
                    project_id = excluded.project_id,
                    telegram_user_id = excluded.telegram_user_id,
                    voted_at = excluded.voted_at
            `)
            .bind(
                roundId,
                donor,
                networkId,
                projectId,
                telegramUserId,
                votedAt,
                now
            )
            .run();

        return { ok: true };
    }

    async listVotes(roundId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM votes
                WHERE round_id = ?
                ORDER BY voted_at ASC
            `)
            .bind(roundId)
            .all();
        return result.results || [];
    }

    async tally(roundId) {
        const result = await this.db
            .prepare(`
                SELECT project_id, COUNT(*) AS vote_count
                FROM votes
                WHERE round_id = ?
                GROUP BY project_id
                ORDER BY vote_count DESC
            `)
            .bind(roundId)
            .all();
        return result.results || [];
    }

    _normalizeRound(row) {
        let candidates = [];
        try {
            candidates = JSON.parse(row.candidate_projects || '[]');
        } catch {
            candidates = [];
        }
        return {
            ...row,
            candidate_projects: candidates
        };
    }
}
