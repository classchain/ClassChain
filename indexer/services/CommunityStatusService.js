/**
 * CommunityStatusService
 *
 * Derives social membership purely from financial state + wallet links.
 *
 * Membership rules:
 *   - Contributor Community  ↔  unallocated > 0 (any linked wallet)
 *   - Project X Community    ↔  sum(allocations to X) > 0
 *   - Public Community       ↔  has at least one verified wallet link
 */

import { WalletLinkRepository } from '../db/WalletLinkRepository.js';
import { ContributionBalanceRepository } from '../db/ContributionBalanceRepository.js';

export class CommunityStatusService {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.linkRepo = new WalletLinkRepository(db);
        this.balanceRepo = new ContributionBalanceRepository(db);
    }

    /**
     * Status by Telegram user (aggregates all linked wallets).
     */
    async statusByTelegram(telegramUserId) {
        if (!telegramUserId) throw new Error('telegram_user_id is required');

        const links = await this.linkRepo.listByTelegram(String(telegramUserId));
        const wallets = [];

        for (const link of links) {
            const detail = await this._walletDetail(link.donor, link.network_id);
            wallets.push({
                donor: link.donor,
                network_id: link.network_id,
                verified_at: link.verified_at,
                ...detail
            });
        }

        return this._summarize(String(telegramUserId), wallets);
    }

    /**
     * Status by a single donor address.
     */
    async statusByDonor(donor, networkId = null) {
        if (!donor) throw new Error('donor is required');

        const wallets = [];
        if (networkId) {
            const detail = await this._walletDetail(donor, networkId);
            const link = await this.linkRepo.getByDonor(donor, networkId);
            wallets.push({
                donor,
                network_id: networkId,
                telegram_user_id: link?.telegram_user_id || null,
                verified_at: link?.verified_at || null,
                ...detail
            });
        } else {
            // All networks where this donor has balance or allocations
            const rows = await this.db
                .prepare(`
                    SELECT DISTINCT network_id FROM (
                        SELECT network_id FROM contribution_balances WHERE donor = ?
                        UNION
                        SELECT network_id FROM allocations WHERE donor = ?
                        UNION
                        SELECT network_id FROM wallet_links WHERE donor = ?
                    )
                `)
                .bind(donor, donor, donor)
                .all();

            for (const r of (rows.results || [])) {
                const detail = await this._walletDetail(donor, r.network_id);
                const link = await this.linkRepo.getByDonor(donor, r.network_id);
                wallets.push({
                    donor,
                    network_id: r.network_id,
                    telegram_user_id: link?.telegram_user_id || null,
                    verified_at: link?.verified_at || null,
                    ...detail
                });
            }
        }

        const tg = wallets.find(w => w.telegram_user_id)?.telegram_user_id || null;
        return this._summarize(tg, wallets);
    }

    async _walletDetail(donor, networkId) {
        const balance = await this.balanceRepo.get(donor, networkId);
        const unallocated = balance?.unallocated || '0';
        const totalContributed = balance?.total_contributed || '0';
        const totalAllocated = balance?.total_allocated || '0';

        const projectRows = await this.db
            .prepare(`
                SELECT project_id,
                       CAST(SUM(CAST(amount_raw AS INTEGER)) AS TEXT) AS allocated_raw
                FROM allocations
                WHERE donor = ? AND network_id = ?
                GROUP BY project_id
                HAVING SUM(CAST(amount_raw AS INTEGER)) > 0
                ORDER BY project_id
            `)
            .bind(donor, networkId)
            .all();

        const projectMemberships = (projectRows.results || []).map(r => ({
            project_id: r.project_id,
            allocated_raw: String(r.allocated_raw)
        }));

        const unallocBn = BigInt(unallocated || '0');

        return {
            total_contributed: String(totalContributed),
            total_allocated: String(totalAllocated),
            unallocated: String(unallocated),
            in_contributor_community: unallocBn > 0n,
            project_memberships: projectMemberships
        };
    }

    _summarize(telegramUserId, wallets) {
        const projectSet = new Set();
        let inContributor = false;

        for (const w of wallets) {
            if (w.in_contributor_community) inContributor = true;
            for (const p of (w.project_memberships || [])) {
                projectSet.add(p.project_id);
            }
        }

        return {
            telegram_user_id: telegramUserId,
            in_public_community: wallets.length > 0,
            in_contributor_community: inContributor,
            project_communities: [...projectSet].sort(),
            wallets
        };
    }

    /**
     * Member lists for Telegram bot sync (Phase 4 will consume these).
     */
    async listContributorMembers(limit = 500) {
        // Linked telegrams that currently have unallocated > 0 on any network
        const result = await this.db
            .prepare(`
                SELECT DISTINCT wl.telegram_user_id, wl.donor, wl.network_id,
                       cb.unallocated
                FROM wallet_links wl
                INNER JOIN contribution_balances cb
                    ON cb.donor = wl.donor AND cb.network_id = wl.network_id
                WHERE CAST(cb.unallocated AS INTEGER) > 0
                ORDER BY wl.telegram_user_id
                LIMIT ?
            `)
            .bind(limit)
            .all();
        return result.results || [];
    }

    async listProjectMembers(projectId, limit = 500) {
        if (!projectId) throw new Error('project_id is required');

        const result = await this.db
            .prepare(`
                SELECT wl.telegram_user_id, a.donor, a.network_id,
                       CAST(SUM(CAST(a.amount_raw AS INTEGER)) AS TEXT) AS allocated_raw
                FROM allocations a
                LEFT JOIN wallet_links wl
                    ON wl.donor = a.donor AND wl.network_id = a.network_id
                WHERE a.project_id = ?
                GROUP BY a.donor, a.network_id
                HAVING SUM(CAST(a.amount_raw AS INTEGER)) > 0
                ORDER BY allocated_raw DESC
                LIMIT ?
            `)
            .bind(projectId, limit)
            .all();
        return result.results || [];
    }
}
