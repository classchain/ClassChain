/**
 * DisbursementService
 *
 * After FIFO allocation plan, creates per-network transfer requests:
 *   GENERAL_POOL[network] → project.funds[network].address
 *
 * Round becomes ALLOCATED only after related disbursements are EXECUTED
 * (see VotingService.finalizeRoundIfBatchComplete).
 *
 * Supports Single-Sig (requiredSignatures <= 1, no multisig) and Multi-Sig
 * for any number of networks.
 */

import { DisbursementRepository } from '../db/DisbursementRepository.js';
import { AllocationRepository } from '../db/AllocationRepository.js';
import { VotingService } from './VotingService.js';
import { EvmClient } from '../adapters/evm/EvmClient.js';
import { TronClient } from '../adapters/tron/TronClient.js';
import { getTokenAddress } from '../../shared/network-config.js';
import { tronAddressToHex } from '../adapters/tron/TronAddress.js';

export const GENERAL_PROJECT_ID = 'GENERAL_POOL';

export class DisbursementService {

    constructor(db, options = {}) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.repo = new DisbursementRepository(db);
        this.allocationRepo = new AllocationRepository(db);
        this.loadProjects = options.loadProjects || null;
        this.env = options.env || null;
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
            const multisigAddress = fromFund?.multisigAddress || null;

            if (!fromAddress) {
                throw new Error(`GENERAL_POOL missing address on network ${networkId}`);
            }
            if (!toAddress) {
                throw new Error(`project ${projectId} missing funds address on network ${networkId}`);
            }
            // Multi-sig requires multisigAddress; single-sig may omit it
            if (requiredSignatures > 1 && !multisigAddress) {
                throw new Error(
                    `GENERAL_POOL requires multisigAddress on network ${networkId} when requiredSignatures=${requiredSignatures}`
                );
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
                multisig_address: multisigAddress,
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
        const rows = await this.repo.listPending(networkId, limit);
        return this._enrich(rows);
    }

    async get(id) {
        const row = await this.repo.get(id);
        if (!row) return null;
        const approvals = await this.repo.listApprovals(id);
        const [enriched] = await this._enrich([row]);
        return { ...(enriched || row), approvals };
    }

    async _enrich(rows) {
        if (!rows.length || !this.loadProjects) return rows;
        const registry = await this.loadProjects();
        return rows.map((row) => {
            const project = this._findProject(registry, row.project_id);
            const general = this._findProject(registry, GENERAL_PROJECT_ID);
            const fund = general?.funds?.[row.network_id];
            return {
                ...row,
                multisig_address: fund?.multisigAddress || null,
                required_signatures: Number(row.required_signatures) || Number(fund?.requiredSignatures) || 1,
                multisig_owners: Array.isArray(fund?.owners) ? fund.owners : [],
                project_name: project?.ProjectName || project?.Name || null,
            };
        });
    }

    _normalizeApprover(networkId, approver) {
        const value = String(approver || '').trim();
        return String(networkId || '').startsWith('tron_') ? value : value.toLowerCase();
    }

    async claimSingleSignature(disbursementId, approver) {
        if (!approver) throw new Error('approver is required');
        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        if ((Number(row.required_signatures) || 1) > 1) {
            throw new Error('claim endpoint is only for single-signature disbursements');
        }
        if (row.status !== 'PENDING_APPROVAL') {
            throw new Error(`disbursement cannot be claimed from status=${row.status}; check the on-chain transaction before retrying`);
        }

        if (this.loadProjects) {
            const registry = await this.loadProjects();
            const general = this._findProject(registry, GENERAL_PROJECT_ID);
            const owners = general?.funds?.[row.network_id]?.owners || [];
            const normalized = this._normalizeApprover(row.network_id, approver);
            const allowed = owners.some((owner) =>
                this._normalizeApprover(row.network_id, owner) === normalized
            );
            if (owners.length && !allowed) throw new Error('wallet is not a GENERAL_POOL owner on this network');
        }

        const normalized = this._normalizeApprover(row.network_id, approver);
        const result = await this.repo.claimSingleSignature(disbursementId, normalized);
        if (!result.claimed) {
            throw new Error('another attempt already claimed this transfer; do not retry until its transaction is reconciled');
        }
        return result.disbursement;
    }

    async releaseSingleSignatureClaim(disbursementId, approver) {
        if (!approver) throw new Error('approver is required');
        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        const normalized = this._normalizeApprover(row.network_id, approver);
        const result = await this.repo.releaseSingleSignatureClaim(disbursementId, normalized);
        if (!result.released) {
            throw new Error('claim cannot be released; the transfer may already have been broadcast or claimed by another wallet');
        }
        return result.disbursement;
    }

    async approve(disbursementId, approver, onchain = {}) {
        if (!approver) throw new Error('approver is required');
        if (!onchain.onchainTxHash) throw new Error('on-chain transaction hash is required');

        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        if (row.status !== 'PENDING_APPROVAL' && row.status !== 'APPROVED' && row.status !== 'PROCESSING') {
            if (row.status === 'EXECUTED') return this.get(disbursementId);
            throw new Error(`cannot approve status=${row.status}`);
        }

        const required = Number(row.required_signatures) || 1;
        const txIndex = onchain.onchainTxIndex ?? null;
        if (required > 1 && (!Number.isInteger(Number(txIndex)) || Number(txIndex) < 0)) {
            throw new Error('on-chain multisig transaction index is required');
        }
        if (required <= 1 && txIndex !== null) {
            throw new Error('single-signature disbursement must not include a multisig transaction index');
        }

        // EVM addresses are case-insensitive; TRON Base58 addresses are case-sensitive.
        const normalizedApprover = this._normalizeApprover(row.network_id, approver);
        if (row.status === 'PROCESSING' && row.error !== 'single_sig_claim:' + normalizedApprover) {
            throw new Error('single-signature transfer is claimed by another wallet');
        }
        const storedApprover = normalizedApprover;
        const existingApprovals = await this.repo.listApprovals(disbursementId);
        const isTron = String(row.network_id || '').startsWith('tron_');
        const alreadyRecorded = existingApprovals.some((a) => {
            const existing = String(a.approver || '');
            if (existing === storedApprover) return true;
            // Older builds lowercased TRON Base58 values. Recognize those legacy rows
            // without applying case-insensitive matching to normal Base58 addresses.
            return isTron && existing.startsWith('t') &&
                existing === normalizedApprover.toLowerCase();
        });
        if (!alreadyRecorded) {
            await this.repo.addApproval(
                disbursementId,
                storedApprover,
                Math.floor(Date.now() / 1000),
                txIndex,
                String(onchain.onchainTxHash)
            );
        }

        const approvals = await this.repo.listApprovals(disbursementId);
        const count = approvals.length;
        if (count >= required && row.status !== 'APPROVED') {
            await this.repo.setStatus(disbursementId, 'APPROVED', { error: null });
        }

        return this.get(disbursementId);
    }

    async _verifyOnChainTransfer(row, txHash) {
        const tokenAddress = getTokenAddress(row.network_id, 'USDT');
        if (!tokenAddress) throw new Error(`USDT contract is not configured for ${row.network_id}`);
        const expectedAmount = BigInt(String(row.amount_raw));
        const transferTopic = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

        if (String(row.network_id || '').startsWith('tron_')) {
            const client = new TronClient(row.network_id);
            const info = await client.getTransactionInfo(txHash);
            const blockNumber = info?.blockNumber ?? info?.block_number;
            const result = String(info?.receipt?.result || info?.result || '').toUpperCase();
            if (!blockNumber || result !== 'SUCCESS') {
                throw new Error('TRON transaction receipt is missing or unsuccessful; D1 status was not changed');
            }

            const address20 = (value) => {
                const hex = String(value || '').replace(/^0x/i, '').toLowerCase();
                if (/^[0-9a-f]{40}$/.test(hex)) return hex;
                if (/^41[0-9a-f]{40}$/.test(hex)) return hex.slice(2);
                return tronAddressToHex(value).slice(-40).toLowerCase();
            };
            const token20 = address20(tokenAddress);
            const from20 = address20(row.from_address);
            const to20 = address20(row.to_address);
            const logs = info.log || info.logs || [];
            const matched = logs.some((log) => {
                const topics = (log.topics || []).map((x) => String(x || '').replace(/^0x/i, '').toLowerCase());
                if (address20(log.address) !== token20 || topics[0] !== transferTopic) return false;
                const from = topics[1]?.slice(-40);
                const to = topics[2]?.slice(-40);
                const data = String(log.data || '').replace(/^0x/i, '');
                try {
                    return from === from20 && to === to20 && BigInt('0x' + data) === expectedAmount;
                } catch (_) { return false; }
            });
            if (!matched) throw new Error('TRON receipt has no matching USDT Transfer for this disbursement');
            return true;
        }

        const client = new EvmClient(row.network_id);
        const receipt = await client.request('eth_getTransactionReceipt', [txHash]);
        if (!receipt) throw new Error('EVM transaction receipt not found; D1 status was not changed');
        let successful = false;
        try { successful = BigInt(receipt.status) === 1n; } catch (_) {}
        if (!successful) throw new Error('EVM transaction receipt is unsuccessful; D1 status was not changed');

        const normalize = (value) => String(value || '').toLowerCase();
        const token = normalize(tokenAddress);
        const fromTopic = '0x' + normalize(row.from_address).replace(/^0x/, '').padStart(64, '0');
        const toTopic = '0x' + normalize(row.to_address).replace(/^0x/, '').padStart(64, '0');
        const matched = (receipt.logs || []).some((log) => {
            const topics = (log.topics || []).map((x) => normalize(x));
            if (normalize(log.address) !== token || topics[0] !== '0x' + transferTopic) return false;
            const data = String(log.data || '');
            try {
                return topics[1] === fromTopic && topics[2] === toTopic && BigInt(data) === expectedAmount;
            } catch (_) { return false; }
        });
        if (!matched) throw new Error('EVM receipt has no matching USDT Transfer for this disbursement');
        return true;
    }

    async _finalizeBatchIfComplete(row) {
        try {
            const voting = new VotingService(this.db, {
                loadProjects: this.loadProjects,
            });
            return await voting.finalizeRoundIfBatchComplete(
                row.allocation_batch_id,
                (batchId) => this.repo.listByBatch(batchId)
            );
        } catch (e) {
            return { finalized: false, error: e.message };
        }
    }

    async markExecuted(disbursementId, executeTxHash, onchainTxIndex = null) {
        if (!executeTxHash) throw new Error('executeTxHash is required');

        const row = await this.repo.get(disbursementId);
        if (!row) throw new Error('disbursement not found');
        if (row.status === 'EXECUTED' && row.execute_tx_hash) {
            // Idempotent retry: also retry FIFO/round finalization if the prior response was lost.
            if (String(row.execute_tx_hash).toLowerCase() !== String(executeTxHash).toLowerCase()) {
                throw new Error('disbursement is already executed with a different transaction hash');
            }
            return { disbursement: row, round_finalize: await this._finalizeBatchIfComplete(row) };
        }
        if (row.status === 'NO_DESTINATION' || row.status === 'FAILED') {
            throw new Error(`cannot execute status=${row.status}`);
        }

        const required = Number(row.required_signatures) || 1;
        if (required <= 1 && onchainTxIndex !== null) {
            throw new Error('single-signature disbursement must not include a multisig transaction index');
        }
        if (required > 1 && (!Number.isInteger(Number(onchainTxIndex)) || Number(onchainTxIndex) < 0)) {
            throw new Error('on-chain multisig transaction index is required');
        }
        const approvals = await this.repo.listApprovals(disbursementId);
        const isTron = String(row.network_id || '').startsWith('tron_');
        if (approvals.length < required && !isTron) {
            throw new Error('cannot mark executed before required approvals are recorded');
        }
        const matchingApproval = approvals.some((a) =>
            String(a.onchain_tx_hash || '').toLowerCase() === String(executeTxHash).toLowerCase() &&
            (required <= 1
                ? a.onchain_tx_index == null
                : Number(a.onchain_tx_index) === Number(onchainTxIndex))
        );
        if (!matchingApproval) {
            throw new Error('execution hash/index does not match a recorded on-chain approval');
        }
        // D1 is updated only after independently verifying the actual USDT Transfer log.
        // On TRON, that exact successful fund-to-treasury transfer proves the multisig threshold
        // was satisfied even if one owner's confirmation was not persisted to D1.
        await this._verifyOnChainTransfer(row, String(executeTxHash));

        const updated = await this.repo.setStatus(disbursementId, 'EXECUTED', {
            executeTxHash,
            onchainTxIndex,
            executedAt: Math.floor(Date.now() / 1000),
            error: null,
        });

        const round_finalize = await this._finalizeBatchIfComplete(updated);
        return { disbursement: updated, round_finalize };
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
