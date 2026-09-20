/**
 * DisbursementRepository — on-chain transfer requests after FIFO allocation.
 */

export class DisbursementRepository {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
    }

    async insert({
        allocationBatchId,
        projectId,
        networkId,
        fromAddress,
        toAddress,
        amountRaw,
        status = 'PENDING_APPROVAL',
        requiredSignatures = 1,
    }) {
        const now = new Date().toISOString();

        const result = await this.db
            .prepare(`
                INSERT INTO disbursements (
                    allocation_batch_id,
                    project_id,
                    network_id,
                    from_address,
                    to_address,
                    amount_raw,
                    status,
                    required_signatures,
                    confirmations_count,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(allocation_batch_id, network_id) DO NOTHING
            `)
            .bind(
                allocationBatchId,
                projectId,
                networkId,
                fromAddress,
                toAddress,
                String(amountRaw),
                status,
                Number(requiredSignatures) || 1,
                now,
                now
            )
            .run();

        const inserted = result.meta?.changes === 1;
        if (!inserted) {
            const existing = await this.getByBatchAndNetwork(allocationBatchId, networkId);
            return { id: existing?.id ?? null, inserted: false, row: existing };
        }

        return { id: result.meta?.last_row_id, inserted: true };
    }

    async get(id) {
        return await this.db
            .prepare(`SELECT * FROM disbursements WHERE id = ?`)
            .bind(id)
            .first();
    }

    async getByBatchAndNetwork(allocationBatchId, networkId) {
        return await this.db
            .prepare(`
                SELECT * FROM disbursements
                WHERE allocation_batch_id = ? AND network_id = ?
            `)
            .bind(allocationBatchId, networkId)
            .first();
    }

    async listByBatch(allocationBatchId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM disbursements
                WHERE allocation_batch_id = ?
                ORDER BY id ASC
            `)
            .bind(allocationBatchId)
            .all();
        return result.results || [];
    }

    async listPending(networkId = null, limit = 50) {
        const lim = Math.min(Number(limit) || 50, 200);
        if (networkId) {
            const result = await this.db
                .prepare(`
                    SELECT * FROM disbursements
                    WHERE status = 'PENDING_APPROVAL' AND network_id = ?
                    ORDER BY id ASC
                    LIMIT ?
                `)
                .bind(networkId, lim)
                .all();
            return result.results || [];
        }
        const result = await this.db
            .prepare(`
                SELECT * FROM disbursements
                WHERE status = 'PENDING_APPROVAL'
                ORDER BY id ASC
                LIMIT ?
            `)
            .bind(lim)
            .all();
        return result.results || [];
    }

    async addApproval(disbursementId, approver, approvedAt) {
        const now = new Date().toISOString();
        const ts = Number(approvedAt) || Math.floor(Date.now() / 1000);

        await this.db
            .prepare(`
                INSERT INTO disbursement_approvals (
                    disbursement_id, approver, approved_at, created_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(disbursement_id, approver) DO NOTHING
            `)
            .bind(disbursementId, approver, ts, now)
            .run();

        const countRow = await this.db
            .prepare(`
                SELECT COUNT(*) AS c FROM disbursement_approvals
                WHERE disbursement_id = ?
            `)
            .bind(disbursementId)
            .first();

        const count = Number(countRow?.c || 0);
        const now2 = new Date().toISOString();

        await this.db
            .prepare(`
                UPDATE disbursements
                SET confirmations_count = ?, updated_at = ?
                WHERE id = ?
            `)
            .bind(count, now2, disbursementId)
            .run();

        return count;
    }

    async listApprovals(disbursementId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM disbursement_approvals
                WHERE disbursement_id = ?
                ORDER BY approved_at ASC
            `)
            .bind(disbursementId)
            .all();
        return result.results || [];
    }

    async setStatus(id, status, extra = {}) {
        const now = new Date().toISOString();
        const fields = ['status = ?', 'updated_at = ?'];
        const values = [status, now];

        if (extra.executeTxHash !== undefined) {
            fields.push('execute_tx_hash = ?');
            values.push(extra.executeTxHash);
        }
        if (extra.onchainTxIndex !== undefined) {
            fields.push('onchain_tx_index = ?');
            values.push(extra.onchainTxIndex);
        }
        if (extra.error !== undefined) {
            fields.push('error = ?');
            values.push(extra.error);
        }
        if (extra.executedAt !== undefined) {
            fields.push('executed_at = ?');
            values.push(extra.executedAt);
        }

        values.push(id);

        await this.db
            .prepare(`UPDATE disbursements SET ${fields.join(', ')} WHERE id = ?`)
            .bind(...values)
            .run();

        return this.get(id);
    }
}
