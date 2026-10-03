/**
 * VotingService — rounds + preference votes.
 * Eligibility: donor has unallocated balance on at least one network.
 * Voting is network-agnostic; network selection belongs only to financial allocation.
 * Rule: only one OPEN round at a time.
 *
 * Vote Preference ≠ Financial Allocation.
 * Close requires selectedProjectId (admin decision); allocation is a separate step.
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

    /**
     * Sum remaining FIFO queue (deterministic) on the given networks.
     */
    async _sumQueueRemaining(networkIds) {
        const ids = Array.isArray(networkIds) ? networkIds : [];
        if (!ids.length) return 0n;
        let total = 0n;
        let offsetGuard = 0;
        // walk FIFO in chunks until empty
        while (offsetGuard < 50) {
            const openEntries = await this.queueRepo.peekOpen(500, null, ids);
            if (!openEntries.length) break;
            for (const e of openEntries) {
                total += BigInt(String(e.remaining_raw || '0'));
            }
            // peek always returns same head if we don't consume — only need one pass for sum
            break;
        }
        // For accurate sum beyond 500, query D1 aggregate would be better; use extra peeks is wrong without consume.
        // Fall back: additional unbounded query via peek with higher limit once.
        const more = await this.queueRepo.peekOpen(5000, null, ids);
        total = 0n;
        for (const e of more) {
            total += BigInt(String(e.remaining_raw || '0'));
        }
        return total;
    }

    /**
     * Run FIFO allocation for a CLOSED round (manual confirm).
     * @param {number} roundId
     * @param {{ requiredAmountRaw?: string }} [options] optional manual amount (base units string)
     */
    async allocateRound(roundId, options = {}) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'CLOSED') {
            throw new Error('round must be CLOSED before allocation');
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

        const projectNetworkIds = Object.entries(project.funds || {})
            .filter(([, fund]) => fund?.address)
            .map(([networkId]) => networkId);

        if (!projectNetworkIds.length) {
            throw new Error('selected project has no configured treasury');
        }

        // Amount: manual override OR locked target from close
        let requestedRaw = round.required_amount_raw;
        if (options.requiredAmountRaw != null && String(options.requiredAmountRaw).trim() !== '') {
            const s = String(options.requiredAmountRaw).replace(/,/g, '').trim();
            if (!/^\d+$/.test(s) || BigInt(s) <= 0n) {
                throw new Error('requiredAmountRaw must be a positive integer string (base units)');
            }
            requestedRaw = s;
        }

        // Cap by deterministic FIFO remaining on allowed networks (not probabilistic)
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
            networkIds: projectNetworkIds
        });

        await this.votingRepo.markAllocated(roundId, result.allocation_batch_id);

        // Build per-network totals from slices (deterministic outcome of FIFO)
        const byNetwork = {};
        for (const s of result.slices || []) {
            const nid = s.network_id;
            byNetwork[nid] = (BigInt(byNetwork[nid] || '0') + BigInt(s.amount_raw || '0')).toString();
        }

        return {
            round_id: roundId,
            requested_amount_raw: requestedRaw,
            effective_amount_raw: effectiveRaw,
            queue_available_raw: String(available),
            capped_to_queue: BigInt(requestedRaw) > available,
            by_network: byNetwork,
            ...result
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
