/**
 * TelegramSyncService
 *
 * Rules (Phase 5):
 *   - unallocated > 0 (any linked wallet)  → must be in GENERAL group
 *   - unallocated = 0 and has allocation to project X → leave GENERAL, join project X group (if configured)
 *   - no link / no balance → leave GENERAL (and project groups when known)
 *
 * Telegram cannot force-add users who never started the bot.
 * Flow: ensure invite link / DM invite → user joins → membership row ACTIVE.
 * Removal uses ban+unban (kick) when bot is admin.
 */

import { CommunityStatusService } from './CommunityStatusService.js';
import { TelegramGroupRepository } from '../db/TelegramGroupRepository.js';
import { TelegramBotClient } from './TelegramBotClient.js';

export class TelegramSyncService {

    constructor(db, env = {}) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
        this.env = env;
        this.community = new CommunityStatusService(db);
        this.groups = new TelegramGroupRepository(db);
        this.bot = env.TELEGRAM_BOT_TOKEN
            ? new TelegramBotClient(env.TELEGRAM_BOT_TOKEN)
            : null;
    }

    async ensureGeneralGroupSeeded() {
        const existing = await this.groups.getGeneral();
        if (existing) return existing;
        const chatId = this.env.TELEGRAM_GENERAL_CHAT_ID || '-1003951313123';
        return this.groups.upsertGroup({
            kind: 'GENERAL',
            projectId: null,
            chatId,
            title: 'ClassChain General Pool',
        });
    }

    /**
     * Full reconcile for GENERAL pool members.
     * Returns summary of actions taken.
     */
    async syncGeneral() {
        if (!this.bot) throw new Error('TELEGRAM_BOT_TOKEN not configured');
        const general = await this.ensureGeneralGroupSeeded();
        const chatId = general.chat_id;

        const shouldBeIn = await this.community.listContributorMembers(2000);
        // Unique telegram ids with unallocated > 0
        const wantSet = new Set(
            (shouldBeIn || [])
                .map((r) => String(r.telegram_user_id || ''))
                .filter(Boolean)
        );

        const current = await this.groups.listMembershipsByChat(chatId, 'ACTIVE');
        const currentSet = new Set(current.map((m) => String(m.telegram_user_id)));

        const summary = {
            chat_id: chatId,
            want: wantSet.size,
            currently_tracked_active: currentSet.size,
            invited: [],
            removed: [],
            errors: [],
        };

        // Invite missing
        for (const tgId of wantSet) {
            if (currentSet.has(tgId)) continue;
            try {
                const link = await this.bot.createChatInviteLink(chatId, {
                    memberLimit: 1,
                    name: `cc-${tgId.slice(-6)}`,
                });
                await this.bot.sendMessage(
                    tgId,
                    `شما واجد شرایط عضویت در گروه <b>ClassChain General Pool</b> هستید (واریز تخصیص‌نیافته).\n\n` +
                    `از لینک زیر وارد شوید:\n${link.invite_link}`
                );
                await this.groups.setMembership({
                    telegramUserId: tgId,
                    chatId,
                    status: 'PENDING_INVITE',
                });
                summary.invited.push(tgId);
            } catch (e) {
                summary.errors.push({ telegram_user_id: tgId, action: 'invite', error: e.message });
                await this.groups.setMembership({
                    telegramUserId: tgId,
                    chatId,
                    status: 'PENDING_INVITE',
                    error: e.message,
                });
            }
        }

        // Remove those no longer eligible
        for (const tgId of currentSet) {
            if (wantSet.has(tgId)) continue;
            try {
                await this.bot.banChatMember(chatId, tgId);
                await this.bot.unbanChatMember(chatId, tgId);
                await this.groups.setMembership({
                    telegramUserId: tgId,
                    chatId,
                    status: 'REMOVED',
                });
                summary.removed.push(tgId);
            } catch (e) {
                summary.errors.push({ telegram_user_id: tgId, action: 'remove', error: e.message });
            }
        }

        return summary;
    }

    /**
     * After allocate to projectId: for each donor who now has unallocated=0
     * on all networks (or specifically lost eligibility), remove from GENERAL
     * and try to move to project group if configured.
     */
    async onAllocated({ projectId, donors = [] }) {
        if (!this.bot) return { ok: false, error: 'no_bot_token' };
        const general = await this.ensureGeneralGroupSeeded();
        const projectGroup = projectId
            ? await this.groups.getProjectGroup(projectId)
            : null;

        const results = [];
        for (const donor of donors) {
            const status = await this.community.statusByDonor(donor);
            const tgId = status.telegram_user_id;
            if (!tgId) {
                results.push({ donor, skipped: 'no_telegram_link' });
                continue;
            }

            const stillContributor = status.in_contributor_community === true;
            if (stillContributor) {
                results.push({ donor, telegram_user_id: tgId, kept_in_general: true });
                continue;
            }

            // Remove from GENERAL
            try {
                await this.bot.banChatMember(general.chat_id, tgId);
                await this.bot.unbanChatMember(general.chat_id, tgId);
                await this.groups.setMembership({
                    telegramUserId: tgId,
                    chatId: general.chat_id,
                    status: 'REMOVED',
                });
            } catch (e) {
                results.push({ donor, telegram_user_id: tgId, remove_error: e.message });
                continue;
            }

            // Invite to project group if exists
            if (projectGroup) {
                try {
                    const link = await this.bot.createChatInviteLink(projectGroup.chat_id, {
                        memberLimit: 1,
                        name: `proj-${String(projectId).slice(0, 8)}`,
                    });
                    await this.bot.sendMessage(
                        tgId,
                        `سهم شما به پروژه <b>${projectId}</b> تخصیص یافت.\n` +
                        `از گروه General خارج شدید. برای پیگیری پروژه:\n${link.invite_link}`
                    );
                    await this.groups.setMembership({
                        telegramUserId: tgId,
                        chatId: projectGroup.chat_id,
                        status: 'PENDING_INVITE',
                    });
                    results.push({ donor, telegram_user_id: tgId, moved_to_project: projectId });
                } catch (e) {
                    results.push({
                        donor,
                        telegram_user_id: tgId,
                        removed_from_general: true,
                        project_invite_error: e.message,
                    });
                }
            } else {
                await this.bot.sendMessage(
                    tgId,
                    `سهم شما به پروژه <b>${projectId}</b> تخصیص یافت و از گروه General خارج شدید.`
                ).catch(() => {});
                results.push({ donor, telegram_user_id: tgId, removed_from_general: true });
            }
        }
        return { ok: true, project_id: projectId, results };
    }

    /**
     * Mark user ACTIVE when they join (from chat_join_request or /start inside group).
     */
    async markJoined(telegramUserId, chatId) {
        await this.groups.setMembership({
            telegramUserId,
            chatId,
            status: 'ACTIVE',
        });
    }
}
