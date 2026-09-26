/**
 * TelegramBotHandler — process webhook updates from Telegram.
 *
 * Commands:
 *   /start  — welcome + how to link
 *   /link   — instructions to link wallet (points to API / web)
 *   /status — community status for this telegram user
 *   /sync   — admin-only: trigger GENERAL sync (needs X-Indexer-Secret via deep context not available; use HTTP API)
 */

import { CommunityStatusService } from './CommunityStatusService.js';
import { WalletLinkService } from './WalletLinkService.js';
import { TelegramSyncService } from './TelegramSyncService.js';
import { TelegramBotClient } from './TelegramBotClient.js';

export class TelegramBotHandler {

    constructor(db, env) {
        this.db = db;
        this.env = env;
        this.bot = env.TELEGRAM_BOT_TOKEN
            ? new TelegramBotClient(env.TELEGRAM_BOT_TOKEN)
            : null;
        this.community = new CommunityStatusService(db);
        this.links = new WalletLinkService(db);
        this.sync = new TelegramSyncService(db, env);
    }

    async handleUpdate(update) {
        if (!this.bot) return { ok: false, error: 'no_bot' };

        // Join request approval path
        if (update.chat_join_request) {
            const req = update.chat_join_request;
            const userId = req.from?.id;
            const chatId = req.chat?.id;
            if (userId && chatId) {
                try {
                    await this.bot.approveChatJoinRequest(chatId, userId);
                    await this.sync.markJoined(userId, chatId);
                } catch (e) {
                    return { ok: false, error: e.message };
                }
            }
            return { ok: true, type: 'join_request' };
        }

        const msg = update.message;
        if (!msg || !msg.text) return { ok: true, ignored: true };

        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        const text = String(msg.text).trim();
        const isPrivate = msg.chat.type === 'private';

        if (!isPrivate) {
            // In groups we mostly track joins via join_request; ignore chatter
            return { ok: true, ignored: 'group_message' };
        }

        if (text.startsWith('/start')) {
            await this.bot.sendMessage(
                chatId,
                `سلام 👋 به ربات ClassChain خوش آمدید.\n\n` +
                `برای عضویت در گروه <b>General Pool</b>:\n` +
                `۱) در سایت به خزانه عمومی USDT واریز کنید\n` +
                `۲) والت را با دستور /link به تلگرام وصل کنید\n` +
                `۳) با /status وضعیت عضویت را ببینید\n\n` +
                `فقط کسانی که هنوز موجودی تخصیص‌نیافته دارند در گروه General می‌مانند.`
            );
            return { ok: true, cmd: 'start' };
        }

        if (text.startsWith('/status')) {
            try {
                const st = await this.community.statusByTelegram(String(userId));
                const lines = [
                    `<b>وضعیت شما</b>`,
                    `Telegram: <code>${userId}</code>`,
                    `لینک والت: ${st.in_public_community ? 'بله' : 'خیر'}`,
                    `جامعه مشارکت‌کننده (unallocated &gt; 0): ${st.in_contributor_community ? 'بله ✅' : 'خیر'}`,
                    `پروژه‌ها: ${(st.project_communities || []).join(', ') || '—'}`,
                ];
                if (st.wallets?.length) {
                    lines.push('', '<b>والت‌ها:</b>');
                    for (const w of st.wallets) {
                        lines.push(
                            `• <code>${w.donor}</code> (${w.network_id})` +
                            ` — آزاد: ${w.unallocated}`
                        );
                    }
                }
                await this.bot.sendMessage(chatId, lines.join('\n'));
            } catch (e) {
                await this.bot.sendMessage(chatId, `خطا: ${e.message}`);
            }
            return { ok: true, cmd: 'status' };
        }

        if (text.startsWith('/link')) {
            await this.bot.sendMessage(
                chatId,
                `برای لینک کردن والت:\n\n` +
                `از صفحه مشارکت یا API استفاده کنید:\n` +
                `<code>POST /api/link/request</code>\n` +
                `{ "telegram_user_id": "${userId}", "network_id": "polygon_amoy" }\n\n` +
                `سپس پیام را با والت امضا کنید و\n` +
                `<code>POST /api/link/verify</code> را بزنید.\n\n` +
                `بعد از لینک موفق و واریز، با /status چک کنید؛ ` +
                `sync بعدی شما را به گروه General دعوت می‌کند.`
            );
            return { ok: true, cmd: 'link' };
        }

        await this.bot.sendMessage(
            chatId,
            `دستورات: /start /status /link`
        );
        return { ok: true, cmd: 'help' };
    }
}
