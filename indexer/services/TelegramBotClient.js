/**
 * TelegramBotClient — thin wrapper around Telegram Bot API.
 * Token from env.TELEGRAM_BOT_TOKEN (Cloudflare Secret).
 */

export class TelegramBotClient {

    constructor(token) {
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
        this.token = token;
        this.base = `https://api.telegram.org/bot${token}`;
    }

    async _call(method, body = {}) {
        const res = await fetch(`${this.base}/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!data.ok) {
            const desc = data.description || res.statusText || 'telegram_api_error';
            const err = new Error(desc);
            err.code = data.error_code;
            err.telegram = data;
            throw err;
        }
        return data.result;
    }

    async sendMessage(chatId, text, extra = {}) {
        return this._call('sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            ...extra,
        });
    }

    /**
     * Create a one-time / limited invite link for a user to join.
     * Prefer this over unban+add when the user has never interacted.
     */
    async createChatInviteLink(chatId, { memberLimit = 1, name = 'ClassChain' } = {}) {
        return this._call('createChatInviteLink', {
            chat_id: chatId,
            name,
            member_limit: memberLimit,
        });
    }

    async banChatMember(chatId, userId) {
        return this._call('banChatMember', {
            chat_id: chatId,
            user_id: Number(userId),
            revoke_messages: false,
        });
    }

    async unbanChatMember(chatId, userId) {
        return this._call('unbanChatMember', {
            chat_id: chatId,
            user_id: Number(userId),
            only_if_banned: true,
        });
    }

    /**
     * Approve join request (if group uses join requests).
     */
    async approveChatJoinRequest(chatId, userId) {
        return this._call('approveChatJoinRequest', {
            chat_id: chatId,
            user_id: Number(userId),
        });
    }

    async getChatMember(chatId, userId) {
        return this._call('getChatMember', {
            chat_id: chatId,
            user_id: Number(userId),
        });
    }

    async setWebhook(url, secretToken = null) {
        const body = { url, allowed_updates: ['message', 'callback_query', 'chat_join_request'] };
        if (secretToken) body.secret_token = secretToken;
        return this._call('setWebhook', body);
    }

    async deleteWebhook() {
        return this._call('deleteWebhook', { drop_pending_updates: false });
    }

    async getMe() {
        return this._call('getMe');
    }
}
