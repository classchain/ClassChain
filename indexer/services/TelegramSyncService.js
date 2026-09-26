/**
 * TelegramSyncService
 *
 * Rules (Phase 5):
 *   - unallocated > 0 (any linked wallet) -> must be in GENERAL group
 *   - after allocation, a donor leaves GENERAL only when no unallocated balance remains
 *   - if a project group exists, the donor receives a project invite
 *
 * Telegram cannot force-add users who never started the bot.
 * Flow: DM one-user invite -> user joins -> membership row ACTIVE.
 * Removal uses ban+unban (kick) when the bot is admin.
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
        this.bot = env.TELEGRAM_BOT_TOKEN ? new TelegramBotClient(env.TELEGRAM_BOT_TOKEN) : null;
    }

    async ensureGeneralGroupSeeded() {
        const existing = await this.groups.getGeneral();
        if (existing) return existing;
        const chatId = this.env.TELEGRAM_GENERAL_CHAT_ID || '-1003951313123';
        return this.groups.upsertGroup({ kind: 'GENERAL', projectId: null, chatId, title: 'ClassChain General Pool' });
    }

    async syncGeneral() {
        if (!this.bot) throw new Error('TELEGRAM_BOT_TOKEN not configured');
        const general = await this.ensureGeneralGroupSeeded();
        const chatId = general.chat_id;
        const shouldBeIn = await this.community.listContributorMembers(2000);
        const wantSet = new Set((shouldBeIn || []).map(r => String(r.telegram_user_id || '')).filter(Boolean));

        const active = await this.groups.listMembershipsByChat(chatId, 'ACTIVE');
        const pending = await this.groups.listMembershipsByChat(chatId, 'PENDING_INVITE');
        const activeSet = new Set(active.map(m => String(m.telegram_user_id)));
        const pendingSet = new Set(pending.map(m => String(m.telegram_user_id)));
        const trackedSet = new Set([...activeSet, ...pendingSet]);

        const summary = { chat_id: chatId, want: wantSet.size, currently_tracked_active: activeSet.size, currently_pending_invite: pendingSet.size, invited: [], removed: [], errors: [] };

        for (const tgId of wantSet) {
            if (trackedSet.has(tgId)) continue;
            try {
                const link = await this.bot.createChatInviteLink(chatId, { memberLimit: 1, name: `cc-${tgId.slice(-6)}` });
                await this.bot.sendMessage(tgId, `شما واجد شرایط عضویت در گروه <b>ClassChain General Pool</b> هستید (واریز تخصیص‌نیافته).\n\nاز لینک زیر وارد شوید:\n${link.invite_link}`);
                await this.groups.setMembership({ telegramUserId: tgId, chatId, status: 'PENDING_INVITE' });
                summary.invited.push(tgId);
            } catch (e) {
                summary.errors.push({ telegram_user_id: tgId, action: 'invite', error: e.message });
                await this.groups.setMembership({ telegramUserId: tgId, chatId, status: 'PENDING_INVITE', error: e.message });
            }
        }

        for (const tgId of trackedSet) {
            if (wantSet.has(tgId)) continue;
            try {
                if (activeSet.has(tgId)) {
                    await this.bot.banChatMember(chatId, tgId);
                    await this.bot.unbanChatMember(chatId, tgId);
                }
                await this.groups.setMembership({ telegramUserId: tgId, chatId, status: 'REMOVED' });
                summary.removed.push(tgId);
            } catch (e) {
                summary.errors.push({ telegram_user_id: tgId, action: 'remove', error: e.message });
            }
        }
        return summary;
    }

    async onAllocated({ projectId, donors = [] }) {
        if (!this.bot) return { ok: false, error: 'no_bot_token' };
        const general = await this.ensureGeneralGroupSeeded();
        const projectGroup = projectId ? await this.groups.getProjectGroup(projectId) : null;
        const results = [];
        const seen = new Set();

        for (const donor of donors) {
            const donorAddress = donor?.donor || donor;
            const donorKey = String(donorAddress);
            if (seen.has(donorKey)) continue;
            seen.add(donorKey);

            // Aggregate across ALL linked networks. A donor with remaining
            // balance on another network must stay in General.
            const status = await this.community.statusByDonor(donorAddress);
            const tgId = status.telegram_user_id;
            if (!tgId) {
                results.push({ donor: donorAddress, skipped: 'no_telegram_link' });
                continue;
            }
            if (status.in_contributor_community === true) {
                results.push({ donor: donorAddress, telegram_user_id: tgId, kept_in_general: true });
                continue;
            }

            try {
                const membership = await this.groups.getMembership(tgId, general.chat_id);
                if (membership?.status === 'ACTIVE') {
                    await this.bot.banChatMember(general.chat_id, tgId);
                    await this.bot.unbanChatMember(general.chat_id, tgId);
                }
                await this.groups.setMembership({ telegramUserId: tgId, chatId: general.chat_id, status: 'REMOVED' });
            } catch (e) {
                results.push({ donor: donorAddress, telegram_user_id: tgId, remove_error: e.message });
                continue;
            }

            if (projectGroup) {
                try {
                    const link = await this.bot.createChatInviteLink(projectGroup.chat_id, { memberLimit: 1, name: `proj-${String(projectId).slice(0, 8)}` });
                    await this.bot.sendMessage(tgId, `سهم شما به پروژه <b>${projectId}</b> تخصیص یافت.\nاز گروه General خارج شدید. برای پیگیری پروژه:\n${link.invite_link}`);
                    await this.groups.setMembership({ telegramUserId: tgId, chatId: projectGroup.chat_id, status: 'PENDING_INVITE' });
                    results.push({ donor: donorAddress, telegram_user_id: tgId, moved_to_project: projectId });
                } catch (e) {
                    results.push({ donor: donorAddress, telegram_user_id: tgId, removed_from_general: true, project_invite_error: e.message });
                }
            } else {
                await this.bot.sendMessage(tgId, `سهم شما به پروژه <b>${projectId}</b> تخصیص یافت و از گروه General خارج شدید.`).catch(() => {});
                results.push({ donor: donorAddress, telegram_user_id: tgId, removed_from_general: true });
            }
        }
        return { ok: true, project_id: projectId, results };
    }

    async markJoined(telegramUserId, chatId) {
        await this.groups.setMembership({ telegramUserId, chatId, status: 'ACTIVE', error: null });
    }

    async markLeft(telegramUserId, chatId, error = null) {
        await this.groups.setMembership({ telegramUserId, chatId, status: 'REMOVED', error });
    }
}
