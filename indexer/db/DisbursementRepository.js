/**
 * DisbursementRepository — on-chain transfer requests after FIFO allocation.
 */

/**
 * Controlled retry: reset a FAILED (or stuck) disbursement back to PENDING_APPROVAL.
 * Keeps previous error text for audit. Does not create a new row.
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
                    WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'EXECUTED') AND network_id = ?
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
                WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'PROCESSING', 'EXECUTED')
                ORDER BY id ASC
                LIMIT ?
            `)
            .bind(lim)
            .all();
        return result.results || [];
    }

    async claimSingleSignature(id, approver) {
        const now = new Date().toISOString();
        const marker = 'single_sig_claim:' + String(approver);
        const result = await this.db
            .prepare(`
                UPDATE disbursements
                SET status = 'PROCESSING', error = ?, updated_at = ?
                WHERE id = ? AND status = 'PENDING_APPROVAL' AND required_signatures <= 1
            `)
            .bind(marker, now, id)
            .run();
        return { claimed: result.meta?.changes === 1, disbursement: await this.get(id) };
    }

    async releaseSingleSignatureClaim(id, approver) {
        const now = new Date().toISOString();
        const marker = 'single_sig_claim:' + String(approver);
        const result = await this.db
            .prepare(`
                UPDATE disbursements
                SET status = 'PENDING_APPROVAL', error = NULL, updated_at = ?
                WHERE id = ? AND status = 'PROCESSING' AND error = ?
            `)
            .bind(now, id, marker)
            .run();
        return { released: result.meta?.changes === 1, disbursement: await this.get(id) };
    }

    async addApproval(disbursementId, approver, approvedAt, onchainTxIndex = null, onchainTxHash = null) {
        const now = new Date().toISOString();
        const ts = Number(approvedAt) || Math.floor(Date.now() / 1000);

        await this.db
            .prepare(`
                INSERT INTO disbursement_approvals (
                    disbursement_id, approver, approved_at, onchain_tx_index, onchain_tx_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(disbursement_id, approver) DO NOTHING
            `)
            .bind(disbursementId, approver, ts, onchainTxIndex, onchainTxHash, now)
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

    async prepareRetry(id, reason = null) {
        const row = await this.get(id);
        if (!row) throw new Error('disbursement not found');
    
        const status = String(row.status || '');
        if (status === 'EXECUTED') {
            throw new Error('cannot retry an already EXECUTED disbursement');
        }
        if (status === 'PENDING_APPROVAL' || status === 'APPROVED' || status === 'PROCESSING') {
            throw new Error(`disbursement is already in progress (status=${status})`);
        }
    
        const now = new Date().toISOString();
        const errorNote = reason
            ? `retry: ${reason}`
            : (row.error ? `retry after: ${row.error}` : 'retry');
    
        await this.db
            .prepare(`
                UPDATE disbursements
                SET status = 'PENDING_APPROVAL',
                    error = ?,
                    execute_tx_hash = NULL,
                    onchain_tx_index = NULL,
                    executed_at = NULL,
                    confirmations_count = 0,
                    updated_at = ?
                WHERE id = ?
            `)
            .bind(errorNote, now, id)
            .run();
    
        // Clear previous approvals so the new attempt starts clean
        await this.db
            .prepare(`DELETE FROM disbursement_approvals WHERE disbursement_id = ?`)
            .bind(id)
            .run();
    
        return this.get(id);
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
