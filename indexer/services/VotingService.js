/**
 * VotingService — rounds + preference votes.
 * Eligibility: donor has unallocated balance on at least one network.
 * Voting is network-agnostic; network selection belongs only to financial allocation.
 * Rule: only one OPEN round at a time.
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

        // Phase 3: only one open round at a time
        const existingOpenId = await this.votingRepo.hasOpenRound();
        if (existingOpenId != null) {
            throw new Error(
                `an open voting round already exists (id=${existingOpenId}); close it before opening a new one`
            );
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

        // Eligibility is aggregated across all networks. The voter does not
        // choose a network; the network is resolved later during allocation.
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
    async closeRound({ roundId, selectedProjectId, requiredAmountRaw }) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'OPEN') throw new Error('round is not open');

        const candidates = round.candidate_projects || [];
        if (!candidates.includes(selectedProjectId)) {
            throw new Error('selectedProjectId is not a candidate');
        }

        return this.votingRepo.closeRound(roundId, selectedProjectId, requiredAmountRaw);
    }

    /**
     * Run FIFO allocation for a CLOSED round (manual confirm).
     * Allocation is global FIFO, restricted to networks where the selected
     * project actually has a treasury. The project registry is the source
     * for that network set.
     */
    async allocateRound(roundId) {
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

        const result = await this.allocationEngine.allocate({
            projectId: round.selected_project_id,
            requiredAmountRaw: round.required_amount_raw,
            networkIds: projectNetworkIds
        });

        await this.votingRepo.markAllocated(roundId, result.allocation_batch_id);

        return {
            round_id: roundId,
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
