/**
 * VotingService — rounds + preference votes.
 * Eligibility: donor has unallocated balance on at least one network.
 * Voting is network-agnostic; network selection belongs only to financial allocation.
 * Rule: only one OPEN round at a time.
 *
 * Vote Preference ≠ Financial Allocation.
 * Close requires selectedProjectId (admin decision); allocation is a separate step.
 *
 * Round status:
 *   OPEN → CLOSED (selected project)
 *   CLOSED stays until every related disburse is on-chain EXECUTED
 *   then → ALLOCATED
 */

import { VotingRepository } from '../db/VotingRepository.js';
import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';
import { AllocationQueueRepository } from '../db/AllocationQueueRepository.js';
import { AllocationEngine } from './AllocationEngine.js';

export class VotingService {

    constructor(db, options = {}) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.votingRepo = new VotingRepository(db);
        this.balanceRepo = new ContributionBalanceRepository(db);
        this.queueRepo = new AllocationQueueRepository(db);
        this.allocationEngine = new AllocationEngine(db);
        this.loadProjects = options.loadProjects || null;
    }

    async openRound({ title, candidateProjects }) {
        if (!title) throw new Error('title is required');
        if (!Array.isArray(candidateProjects) || candidateProjects.length < 1) {
            throw new Error('candidateProjects must be a non-empty array');
        }

        const existingOpenId = await this.votingRepo.hasOpenRound();
        if (existingOpenId != null) {
            throw new Error(
                `an open voting round already exists (id=${existingOpenId}); close it before opening a new one`
            );
        }

        if (!this.loadProjects) {
            throw new Error('Projects registry loader is required for voting');
        }
        const registry = await this.loadProjects();
        for (const projectId of candidateProjects) {
            const project = this._findProject(registry, projectId);
            if (!project) {
                throw new Error(`candidate project ${projectId} not found in Projects.json`);
            }
            if (String(project.ProjectID) === 'GENERAL_POOL') {
                throw new Error('GENERAL_POOL cannot be a voting candidate');
            }
            const hasTreasury = Object.values(project.funds || {}).some((fund) => fund?.address);
            if (!hasTreasury) {
                throw new Error(`candidate project ${projectId} has no configured treasury`);
            }
        }

        return this.votingRepo.createRound({ title, candidateProjects });
    }

    async listRounds(limit = 20) {
        return this.votingRepo.listRounds(limit);
    }

    async getRound(id) {
        const round = await this.votingRepo.getRound(id);
        if (!round) return null;
        const tally = await this.votingRepo.tally(id);
        const votes = await this.votingRepo.listVotes(id);
        return { ...round, tally, votes_count: votes.length };
    }

    async castVote({ roundId, donor, projectId, telegramUserId = null }) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'OPEN') throw new Error('round is not open');

        const candidates = (round.candidate_projects || []).map(String);
        if (!candidates.includes(String(projectId))) {
            throw new Error('projectId is not a candidate in this round');
        }

        const unallocated = await this.balanceRepo.getTotalUnallocated(donor);
        if (unallocated <= 0n) {
            throw new Error('donor has no unallocated balance; not eligible to vote');
        }

        await this.votingRepo.castVote({
            roundId,
            donor,
            projectId: String(projectId),
            telegramUserId
        });

        return { ok: true, round_id: roundId, donor, project_id: String(projectId) };
    }

    async closeRound({ roundId, selectedProjectId, resultTally = [] }) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'OPEN') throw new Error('round is not open');

        if (selectedProjectId === undefined || selectedProjectId === null || String(selectedProjectId).trim() === '') {
            throw new Error('selectedProjectId is required to close a round');
        }
        const selectedId = String(selectedProjectId).trim();

        const candidates = (round.candidate_projects || []).map(String);
        if (!candidates.includes(selectedId)) {
            throw new Error('selectedProjectId is not a candidate');
        }

        if (!this.loadProjects) {
            throw new Error('Projects registry loader is required for voting');
        }
        const registry = await this.loadProjects();
        const project = this._findProject(registry, selectedId);
        if (!project) {
            throw new Error(`project ${selectedId} not found in Projects.json`);
        }

        const targetAmount = project['targetAmount(USDT)'];
        if (targetAmount === undefined || targetAmount === null || String(targetAmount).trim() === '') {
            throw new Error(`project ${selectedId} has no targetAmount(USDT) in Projects.json`);
        }

        const targetText = String(targetAmount).replace(/,/g, '').trim();
        if (!/^\d+(\.\d+)?$/.test(targetText)) {
            throw new Error(`invalid targetAmount(USDT) for project ${selectedId}`);
        }
        const [whole, fraction = ''] = targetText.split('.');
        const fractionPadded = (fraction + '000000').slice(0, 6);
        const requiredAmountRaw = (BigInt(whole) * 1000000n + BigInt(fractionPadded)).toString();
        if (requiredAmountRaw === '0') {
            throw new Error(`project ${selectedId} has zero targetAmount(USDT)`);
        }

        const inputTally = Array.isArray(resultTally) ? resultTally : [];
        const counts = new Map();
        for (const item of inputTally) {
            const projectId = String(item?.project_id ?? item?.projectId ?? '');
            const voteCount = Number(item?.vote_count ?? item?.voteCount);
            if (!projectId) continue;
            if (!candidates.includes(projectId)) {
                throw new Error('result contains non-candidate project ' + projectId);
            }
            if (counts.has(projectId)) {
                throw new Error('duplicate result for project ' + projectId);
            }
            if (!Number.isInteger(voteCount) || voteCount < 0) {
                throw new Error('invalid vote count for project ' + projectId);
            }
            counts.set(projectId, voteCount);
        }
        const tally = candidates.map((pid) => ({
            project_id: pid,
            vote_count: counts.has(pid) ? counts.get(pid) : 0,
        }));

        return this.votingRepo.closeRound(roundId, selectedId, requiredAmountRaw, tally);
    }

    async _sumQueueRemaining(networkIds) {
        return this.queueRepo.sumAvailable(Array.isArray(networkIds) ? networkIds : []);
    }

    /**
     * Plan FIFO allocation for a CLOSED round and prepare disburse.
     * Does NOT mark the round ALLOCATED and does NOT debit balances yet.
     * Queue slices are locked so they cannot be double-spent.
     * Round stays CLOSED until on-chain EXECUTED finalizes the batch.
     */
    async allocateRound(roundId, options = {}) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'CLOSED') {
            throw new Error('round must be CLOSED before allocation plan (status=' + round.status + ')');
        }
        if (round.allocation_batch_id) {
            throw new Error(
                'round already has allocation_batch_id=' + round.allocation_batch_id +
                '; complete on-chain disburse (or cancel) before planning again'
            );
        }
        if (!round.selected_project_id || !round.required_amount_raw) {
            throw new Error('round missing selected_project_id or required_amount_raw');
        }

        if (!this.loadProjects) {
            throw new Error('Projects registry loader is required for allocation');
        }

        const registry = await this.loadProjects();
        const project = this._findProject(registry, round.selected_project_id);
        if (!project) {
            throw new Error(`project ${round.selected_project_id} not found in Projects.json`);
        }

        const general = this._findProject(registry, 'GENERAL_POOL');
        if (!general) throw new Error('GENERAL_POOL not found in Projects.json');

        // A network is allocatable only when both source and destination are
        // configured and the source has a Multisig executor.
        const projectNetworkIds = Object.entries(project.funds || {})
            .filter(([networkId, fund]) => {
                const source = general.funds?.[networkId];
                return Boolean(fund?.address && source?.address && source?.multisigAddress);
            })
            .map(([networkId]) => networkId);

        if (!projectNetworkIds.length) {
            throw new Error('selected project has no configured treasury');
        }

        let requestedRaw = round.required_amount_raw;
        if (options.requiredAmountRaw != null && String(options.requiredAmountRaw).trim() !== '') {
            const s = String(options.requiredAmountRaw).replace(/,/g, '').trim();
            if (!/^\d+$/.test(s) || BigInt(s) <= 0n) {
                throw new Error('requiredAmountRaw must be a positive integer string (base units)');
            }
            requestedRaw = s;
        }

        const available = await this._sumQueueRemaining(projectNetworkIds);
        if (available <= 0n) {
            throw new Error('no unallocated FIFO balance on project networks');
        }
        let effectiveRaw = requestedRaw;
        if (BigInt(requestedRaw) > available) {
            effectiveRaw = String(available);
        }

        const result = await this.allocationEngine.allocate({
            projectId: round.selected_project_id,
            requiredAmountRaw: effectiveRaw,
            networkIds: projectNetworkIds,
            commitBalances: false
        });

        await this.votingRepo.attachAllocationBatch(roundId, result.allocation_batch_id);

        const byNetwork = {};
        for (const s of result.slices || []) {
            const nid = s.network_id;
            byNetwork[nid] = (BigInt(byNetwork[nid] || '0') + BigInt(s.amount_raw || '0')).toString();
        }

        return {
            round_id: roundId,
            round_status: 'CLOSED',
            note: 'Round stays CLOSED until on-chain disburse is EXECUTED; balances remain unallocated until then',
            requested_amount_raw: requestedRaw,
            effective_amount_raw: effectiveRaw,
            queue_available_raw: String(available),
            capped_to_queue: BigInt(requestedRaw) > available,
            by_network: byNetwork,
            ...result
        };
    }

    /**
     * After disburse EXECUTED: if every disburse for the batch is terminal,
     * commit balances and mark round ALLOCATED.
     */
    async finalizeRoundIfBatchComplete(allocationBatchId, listDisbursementsFn) {
        if (!allocationBatchId) return { finalized: false, reason: 'no_batch' };

        const round = await this.votingRepo.findByAllocationBatchId(allocationBatchId);
        if (!round) return { finalized: false, reason: 'no_round_for_batch' };
        if (round.status === 'ALLOCATED') {
            return { finalized: false, reason: 'already_allocated', round };
        }
        if (round.status !== 'CLOSED') {
            return { finalized: false, reason: 'round_not_closed', round };
        }

        const rows = await listDisbursementsFn(allocationBatchId);
        if (!rows.length) {
            return { finalized: false, reason: 'no_disbursements' };
        }

        const terminal = new Set(['EXECUTED']);
        const pending = rows.filter((r) => !terminal.has(String(r.status)));
        if (pending.length) {
            return {
                finalized: false,
                reason: 'disbursements_pending',
                pending: pending.map((r) => ({ id: r.id, status: r.status, network_id: r.network_id }))
            };
        }

        const allExecuted = rows.every((r) => String(r.status) === 'EXECUTED');
        if (!allExecuted) {
            return { finalized: false, reason: 'not_all_disbursements_executed' };
        }

        await this.allocationEngine.commitBatchBalances(allocationBatchId);

        const updated = await this.votingRepo.markAllocated(round.id, allocationBatchId);
        return {
            finalized: true,
            round: updated,
            allocation_batch_id: allocationBatchId
        };
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
