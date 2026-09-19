/**
 * VotingService — rounds + preference votes.
 * Eligibility: unallocated > 0 on the given network.
 */

import { VotingRepository } from '../db/VotingRepository.js';
import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';
import { AllocationEngine } from './AllocationEngine.js';

export class VotingService {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.votingRepo = new VotingRepository(db);
        this.balanceRepo = new ContributionBalanceRepository(db);
        this.allocationEngine = new AllocationEngine(db);
    }

    async openRound({ title, candidateProjects, networkId = null }) {
        if (!title) throw new Error('title is required');
        if (!Array.isArray(candidateProjects) || candidateProjects.length < 1) {
            throw new Error('candidateProjects must be a non-empty array');
        }
        return this.votingRepo.createRound({ title, candidateProjects, networkId });
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

    async castVote({ roundId, donor, networkId, projectId, telegramUserId = null }) {
        const round = await this.votingRepo.getRound(roundId);
        if (!round) throw new Error('round not found');
        if (round.status !== 'OPEN') throw new Error('round is not open');

        const candidates = round.candidate_projects || [];
        if (!candidates.includes(projectId)) {
            throw new Error('projectId is not a candidate in this round');
        }

        // Eligibility: unallocated > 0
        const balance = await this.balanceRepo.get(donor, networkId);
        const unallocated = BigInt(balance?.unallocated || '0');
        if (unallocated <= 0n) {
            throw new Error('donor has no unallocated balance; not eligible to vote');
        }

        await this.votingRepo.castVote({
            roundId,
            donor,
            networkId,
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

        const result = await this.allocationEngine.allocate({
            projectId: round.selected_project_id,
            requiredAmountRaw: round.required_amount_raw,
            networkId: round.network_id || null
        });

        await this.votingRepo.markAllocated(roundId, result.allocation_batch_id);

        return {
            round_id: roundId,
            ...result
        };
    }
}
