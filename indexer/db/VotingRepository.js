/**
 * VotingRepository — voting rounds and preference votes.
 * Vote Preference ≠ Financial Allocation.
 *
 * Status lifecycle (money-first):
 *   OPEN → CLOSED (selected project)
 *        → ALLOCATED only after on-chain disburse EXECUTED for the batch
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
        candidateProjects
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
                    opened_at,
                    created_at
                ) VALUES (?, ?, 'OPEN', ?, ?)
            `)
            .bind(title, candidatesJson, openedAt, now)
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

    async getRoundByBatchId(allocationBatchId) {
        if (!allocationBatchId) return null;
        const row = await this.db
            .prepare(`
                SELECT * FROM voting_rounds
                WHERE allocation_batch_id = ?
                LIMIT 1
            `)
            .bind(allocationBatchId)
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

    async closeRound(id, selectedProjectId, requiredAmountRaw, resultTally = []) {
        const closedAt = Math.floor(Date.now() / 1000);
        await this.db
            .prepare(`
                UPDATE voting_rounds
                SET status = 'CLOSED',
                    selected_project_id = ?,
                    required_amount_raw = ?,
                    result_tally = ?,
                    closed_at = ?
                WHERE id = ? AND status = 'OPEN'
            `)
            .bind(
                selectedProjectId,
                String(requiredAmountRaw),
                JSON.stringify(resultTally),
                closedAt,
                id
            )
            .run();
        return this.getRound(id);
    }

    /**
     * Attach a planned allocation batch while keeping status CLOSED.
     * ALLOCATED is set only after on-chain commit via markAllocated.
     */
    async attachPendingBatch(id, allocationBatchId) {
        await this.db
            .prepare(`
                UPDATE voting_rounds
                SET allocation_batch_id = ?
                WHERE id = ? AND status = 'CLOSED'
            `)
            .bind(allocationBatchId, id)
            .run();
        return this.getRound(id);
    }

    async markAllocated(id, allocationBatchId) {
        const allocatedAt = Math.floor(Date.now() / 1000);
        await this.db
            .prepare(`
                UPDATE voting_rounds
                SET status = 'ALLOCATED',
                    allocation_batch_id = COALESCE(?, allocation_batch_id),
                    allocated_at = ?
                WHERE id = ? AND status = 'CLOSED'
            `)
            .bind(allocationBatchId || null, allocatedAt, id)
            .run();
        return this.getRound(id);
    }

    async castVote({
        roundId,
        donor,
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
                ) VALUES (?, ?, NULL, ?, ?, ?, ?)
                ON CONFLICT(round_id, donor) DO UPDATE SET
                    project_id = excluded.project_id,
                    telegram_user_id = excluded.telegram_user_id,
                    voted_at = excluded.voted_at
            `)
            .bind(
                roundId,
                donor,
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
        let resultTally = [];
        try {
            resultTally = JSON.parse(row.result_tally || '[]');
        } catch {
            resultTally = [];
        }
        return {
            ...row,
            candidate_projects: candidates,
            result_tally: resultTally
        };
    }
}
