/**
 * VotingService — rounds + preference votes.
 * Eligibility: donor has unallocated balance on at least one network.
 * Voting is network-agnostic; network selection belongs only to financial allocation.
 * Rule: only one OPEN round at a time.
 *
 * Money-first lifecycle:
 *   OPEN → CLOSED (selected project)
 *   allocateRound → PLANNED slices + pending disbursements (round still CLOSED,
 *                   balances still unallocated)
 *   disburse EXECUTED → commit queue/balance → when batch done → ALLOCATED
 */

import { VotingRepository } from '../db/VotingRepository.js';
import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';
import { AllocationEngine } from './AllocationEngine.js';

export class VotingService {

    constructor(db, options = {}) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.votingRepo = new VotingRepository(db);
        this.balanceRepo = new ContributionBalanceRepository(db);
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

        const candidates = round.candidate_projects || [];
        if (!candidates.includes(projectId)) {
            throw new Error('projectId is not a candidate in this round');
        }

        const unallocated = await this.balanceRepo.getTotalUnallocated(donor);
        if (unallocated <= 0n) {
            throw new Error('donor has no unallocated balance; not eligible to vote');
        }

        await this.votingRepo.castVote({
            roundId,
            donor,
            projectId,
            telegramUserId
        });

        return { ok: true, round_id: roundId, donor, project_id: projectId };
    }

    /**
     * Close round with admin-selected project + required amount.
     * Does NOT allocate yet — allocation is a separate explicit step.
     */
    async closeRound({ roundId, selectedProjectId, resultTally = [] }) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'OPEN') throw new Error('round is not open');

        const candidates = round.candidate_projects || [];
        if (!candidates.includes(selectedProjectId)) {
            throw new Error('selectedProjectId is not a candidate');
        }

        if (!this.loadProjects) {
            throw new Error('Projects registry loader is required for voting');
        }
        const registry = await this.loadProjects();
        const project = this._findProject(registry, selectedProjectId);
        if (!project) {
            throw new Error(`project ${selectedProjectId} not found in Projects.json`);
        }

        const targetAmount = project['targetAmount(USDT)'];
        if (targetAmount === undefined || targetAmount === null || String(targetAmount).trim() === '') {
            throw new Error(`project ${selectedProjectId} has no targetAmount(USDT) in Projects.json`);
        }

        const targetText = String(targetAmount).replace(/,/g, '').trim();
        if (!/^\d+(\.\d+)?$/.test(targetText)) {
            throw new Error(`invalid targetAmount(USDT) for project ${selectedProjectId}`);
        }
        const [whole, fraction = ''] = targetText.split('.');
        const fractionPadded = (fraction + '000000').slice(0, 6);
        const requiredAmountRaw = (BigInt(whole) * 1000000n + BigInt(fractionPadded)).toString();
        if (requiredAmountRaw === '0') {
            throw new Error(`project ${selectedProjectId} has zero targetAmount(USDT)`);
        }

        const tally = Array.isArray(resultTally) ? resultTally : [];
        // Manual close may send empty tally; only validate when provided
        if (tally.length > 0) {
            const candidateSet = new Set(candidates.map(String));
            const seen = new Set();
            for (const item of tally) {
                const projectId = String(item?.project_id ?? item?.projectId ?? '');
                const voteCount = Number(item?.vote_count ?? item?.voteCount);
                if (!candidateSet.has(projectId)) throw new Error('result contains non-candidate project ' + projectId);
                if (seen.has(projectId)) throw new Error('duplicate result for project ' + projectId);
                if (!Number.isInteger(voteCount) || voteCount < 0) throw new Error('invalid vote count for project ' + projectId);
                seen.add(projectId);
            }
            if (seen.size !== candidateSet.size) {
                throw new Error('result_tally must contain every candidate project exactly once');
            }
        }

        return this.votingRepo.closeRound(roundId, selectedProjectId, requiredAmountRaw, tally);
    }

    /**
     * Plan FIFO allocation for a CLOSED round.
     * Does NOT consume queue or debit balances and does NOT mark ALLOCATED.
     * Creates PLANNED allocation rows; worker then builds disbursements.
     * Round stays CLOSED until on-chain EXECUTED commits the ledger.
     */
    async allocateRound(roundId, options = {}) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'CLOSED') {
            throw new Error('round must be CLOSED before allocation planning');
        }
        if (!round.selected_project_id || !round.required_amount_raw) {
            throw new Error('round missing selected_project_id or required_amount_raw');
        }
        if (round.allocation_batch_id) {
            throw new Error(
                `round already has a planned batch (${round.allocation_batch_id}); wait for disburse EXECUTED or clear the plan first`
            );
        }

        if (!this.loadProjects) {
            throw new Error('Projects registry loader is required for allocation');
        }

        const registry = await this.loadProjects();
        const project = this._findProject(registry, round.selected_project_id);
        if (!project) {
            throw new Error(`project ${round.selected_project_id} not found in Projects.json`);
        }

        const projectNetworkIds = Object.entries(project.funds || {})
            .filter(([, fund]) => fund?.address)
            .map(([networkId]) => networkId);

        if (!projectNetworkIds.length) {
            throw new Error('selected project has no configured treasury');
        }

        const requiredAmountRaw = options.requiredAmountRaw
            || options.required_amount_raw
            || round.required_amount_raw;

        const result = await this.allocationEngine.plan({
            projectId: round.selected_project_id,
            requiredAmountRaw,
            networkIds: projectNetworkIds
        });

        if (!result.slices_count) {
            throw new Error('no open queue capacity to plan allocation');
        }

        // Keep status CLOSED — only store the pending batch id
        await this.votingRepo.attachPendingBatch(roundId, result.allocation_batch_id);

        return {
            round_id: roundId,
            round_status: 'CLOSED',
            ledger_committed: false,
            message: 'FIFO planned; balances stay unallocated until on-chain disburse EXECUTED',
            ...result
        };
    }

    /**
     * After all planned slices for a batch are COMMITTED, mark the round ALLOCATED.
     */
    async tryMarkAllocatedForBatch(allocationBatchId) {
        const round = await this.votingRepo.getRoundByBatchId(allocationBatchId);
        if (!round || round.status !== 'CLOSED') return null;

        const plannedLeft = await this.allocationEngine.allocationRepo
            .countPlannedByBatch(allocationBatchId);

        if (plannedLeft > 0) return { round_id: round.id, status: 'CLOSED', planned_left: plannedLeft };

        const updated = await this.votingRepo.markAllocated(round.id, allocationBatchId);
        return { round_id: round.id, status: updated?.status, planned_left: 0 };
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
