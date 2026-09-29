/**
 * TelegramGroupRepository — configured groups + membership rows.
 */

export class TelegramGroupRepository {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
    }

    async upsertGroup({ kind, projectId = null, chatId, title = null, inviteLink = null }) {
        if (!kind || !chatId) throw new Error('kind and chatId are required');
        const now = new Date().toISOString();
        await this.db
            .prepare(`
                INSERT INTO telegram_groups (kind, project_id, chat_id, title, invite_link, active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(chat_id) DO UPDATE SET
                    kind = excluded.kind,
                    project_id = excluded.project_id,
                    title = COALESCE(excluded.title, telegram_groups.title),
                    invite_link = COALESCE(excluded.invite_link, telegram_groups.invite_link),
                    active = 1,
                    updated_at = excluded.updated_at
            `)
            .bind(kind, projectId, String(chatId), title, inviteLink, now, now)
            .run();
        return this.getByChatId(chatId);
    }

    async getByChatId(chatId) {
        return await this.db
            .prepare(`SELECT * FROM telegram_groups WHERE chat_id = ? LIMIT 1`)
            .bind(String(chatId))
            .first();
    }

    async getGeneral() {
        return await this.db
            .prepare(`SELECT * FROM telegram_groups WHERE kind = 'GENERAL' AND active = 1 LIMIT 1`)
            .first();
    }

    async getProjectGroup(projectId) {
        if (!projectId) return null;
        return await this.db
            .prepare(`SELECT * FROM telegram_groups WHERE kind = 'PROJECT' AND project_id = ? AND active = 1 LIMIT 1`)
            .bind(String(projectId))
            .first();
    }

    async listActive() {
        const r = await this.db
            .prepare(`SELECT * FROM telegram_groups WHERE active = 1 ORDER BY kind, project_id`)
            .all();
        return r.results || [];
    }

    async setMembership({ telegramUserId, chatId, status, error = null }) {
        const now = new Date().toISOString();
        const ts = Math.floor(Date.now() / 1000);
        await this.db
            .prepare(`
                INSERT INTO telegram_memberships (
                    telegram_user_id, chat_id, status, last_synced_at, last_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(telegram_user_id, chat_id) DO UPDATE SET
                    status = excluded.status,
                    last_synced_at = excluded.last_synced_at,
                    last_error = excluded.last_error,
                    updated_at = excluded.updated_at
            `)
            .bind(String(telegramUserId), String(chatId), status, ts, error, now, now)
            .run();
    }

    async listMembershipsByChat(chatId, status = null) {
        let q = `SELECT * FROM telegram_memberships WHERE chat_id = ?`;
        const binds = [String(chatId)];
        if (status) {
            q += ` AND status = ?`;
            binds.push(status);
        }
        const r = await this.db.prepare(q).bind(...binds).all();
        return r.results || [];
    }

    async getMembership(telegramUserId, chatId) {
        return await this.db
            .prepare(`SELECT * FROM telegram_memberships WHERE telegram_user_id = ? AND chat_id = ? LIMIT 1`)
            .bind(String(telegramUserId), String(chatId))
            .first();
    }
}
