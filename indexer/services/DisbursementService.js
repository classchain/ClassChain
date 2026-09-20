/**
 * DisbursementService
 *
 * After FIFO allocation, creates per-network transfer requests:
 *   GENERAL_POOL[network] → project.funds[network].address
 *
 * Order of money is already fixed by AllocationEngine (FIFO).
 * This service only packages those slices for treasury-owner approval
 * and eventual on-chain execution (single-sig now, multi-sig later).
 *
 * Worker does NOT hold private keys. Owners approve externally;
 * admin can mark executed after on-chain tx is known.
 */

import { DisbursementRepository } from '../db/DisbursementRepository.js';
import { AllocationRepository } from '../db/AllocationRepository.js';

export const GENERAL_PROJECT_ID = 'GENERAL_POOL';

export class DisbursementService {

    constructor(db, options = {}) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.repo = new DisbursementRepository(db);
        this.allocationRepo = new AllocationRepository(db);
        this.loadProjects = options.loadProjects || null;
    }

    async prepareFromBatch(allocationBatchId, projectId, projectsRegistry = null) {
        if (!allocationBatchId) throw new Error('allocationBatchId is required');
        if (!projectId) throw new Error('projectId is required');

        const slices = await this.allocationRepo.listByBatch(allocationBatchId);
        if (!slices.length) {
            return { ok: true, disbursements: [], message: 'no slices in batch' };
        }

        const registry = projectsRegistry || (this.loadProjects ? await this.loadProjects() : null);
        if (!registry) throw new Error('Projects registry is required');

        const general = this._findProject(registry, GENERAL_PROJECT_ID);
        const project = this._findProject(registry, projectId);
        if (!general) throw new Error('GENERAL_POOL not found in Projects.json');
        if (!project) throw new Error(`project ${projectId} not found in Projects.json`);

        const byNetwork = new Map();
        for (const s of slices) {
            const nid = s.network_id;
            const prev = byNetwork.get(nid) || 0n;
            byNetwork.set(nid, prev + BigInt(s.amount_raw || '0'));
        }

        const created = [];

        for (const [networkId, amount] of byNetwork.entries()) {
            if (amount <= 0n) continue;

            const fromFund = general.funds?.[networkId];
            const toFund = project.funds?.[networkId];

            const fromAddress = fromFund?.address || null;
            const toAddress = toFund?.address || null;
            const requiredSignatures = Number(fromFund?.requiredSignatures) || 1;

            if (!fromAddress || !toAddress) {
                const row = await this.repo.insert({
                    allocationBatchId,
                    projectId,
                    networkId,
                    fromAddress: fromAddress || '',
                    toAddress: toAddress || '',
                    amountRaw: String(amount),
                    status: 'NO_DESTINATION',
                    requiredSignatures,
                });
                created.push({
                    network_id: networkId,
                    status: 'NO_DESTINATION',
                    amount_raw: String(amount),
                    reason: !fromAddress
                        ? 'GENERAL_POOL missing address on this network'
                        : 'project missing funds address on this network',
                    id: row.id,
                    inserted: row.inserted,
                });
                continue;
            }

            const row = await this.repo.insert({
                allocationBatchId,
                projectId,
                networkId,
                fromAddress,
                toAddress,
                amountRaw: String(amount),
                status: 'PENDING_APPROVAL',
                requiredSignatures,
            });

            created.push({
                network_id: networkId,
                status: 'PENDING_APPROVAL',
                amount_raw: String(amount),
                from_address: fromAddress,
                to_address: toAddress,
                multisig_address: fromFund?.multisigAddress || null,
                required_signatures: requiredSignatures,
                id: row.id,
                inserted: row.inserted,
            });
        }

        return {
            ok: true,
            allocation_batch_id: allocationBatchId,
            project_id: projectId,
            disbursements: created,
        };
    }

    async listPending(networkId = null, limit = 50) {
        return this.repo.listPending(networkId, limit);
    }

    async get(id) {
        const row = await this.repo.get(id);
        if (!row) return null;
        const approvals = await this.repo.listApprovals(id);
        return { ...row, approvals };
    }

    async approve(disbursementId, approver) {
        if (!approver) throw new Error('approver is required');

        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        if (row.status !== 'PENDING_APPROVAL' && row.status !== 'APPROVED') {
            throw new Error(`cannot approve status=${row.status}`);
        }

        const count = await this.repo.addApproval(
            disbursementId,
            String(approver).toLowerCase(),
            Math.floor(Date.now() / 1000)
        );

        const required = Number(row.required_signatures) || 1;
        if (count >= required && row.status === 'PENDING_APPROVAL') {
            await this.repo.setStatus(disbursementId, 'APPROVED');
        }

        return this.get(disbursementId);
    }

    async markExecuted(disbursementId, executeTxHash, onchainTxIndex = null) {
        if (!executeTxHash) throw new Error('executeTxHash is required');

        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        if (row.status === 'EXECUTED') {
            return row;
        }
        if (row.status === 'NO_DESTINATION' || row.status === 'FAILED') {
            throw new Error(`cannot execute status=${row.status}`);
        }

        return this.repo.setStatus(disbursementId, 'EXECUTED', {
            executeTxHash,
            onchainTxIndex,
            executedAt: Math.floor(Date.now() / 1000),
            error: null,
        });
    }

    async markFailed(disbursementId, errorMessage) {
        return this.repo.setStatus(disbursementId, 'FAILED', {
            error: String(errorMessage || 'unknown'),
        });
    }

    _findProject(registry, projectId) {
        const features = registry?.features || [];
        const id = String(projectId);
        for (const f of features) {
            const a = f?.attributes;
            if (a && String(a.ProjectID) === id) return a;
        }
        return null;
    }
}
