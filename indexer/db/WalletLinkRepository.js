/**
 * WalletLinkRepository — Telegram ↔ Wallet links + nonces.
 */

export class WalletLinkRepository {

    constructor(db) {
        if (!db) throw new Error('D1 database is required');
        this.db = db;
    }

    async createNonce({ nonce, telegramUserId, networkId, expiresAt }) {
        const now = new Date().toISOString();
        await this.db
            .prepare(`
                INSERT INTO link_nonces (
                    nonce, telegram_user_id, network_id, expires_at, used, created_at
                ) VALUES (?, ?, ?, ?, 0, ?)
            `)
            .bind(nonce, telegramUserId, networkId, expiresAt, now)
            .run();
        return { nonce, telegram_user_id: telegramUserId, network_id: networkId, expires_at: expiresAt };
    }

    async getNonce(nonce) {
        return await this.db
            .prepare(`SELECT * FROM link_nonces WHERE nonce = ? LIMIT 1`)
            .bind(nonce)
            .first();
    }

    async markNonceUsed(nonce) {
        await this.db
            .prepare(`UPDATE link_nonces SET used = 1 WHERE nonce = ?`)
            .bind(nonce)
            .run();
    }

    async upsertLink({
        telegramUserId,
        donor,
        networkId,
        signature,
        verifiedAt
    }) {
        const now = new Date().toISOString();
        const ts = Number(verifiedAt) || Math.floor(Date.now() / 1000);

        // Clear conflicting links first (same tg+network or same donor+network)
        await this.db
            .prepare(`
                DELETE FROM wallet_links
                WHERE (telegram_user_id = ? AND network_id = ?)
                   OR (donor = ? AND network_id = ?)
            `)
            .bind(telegramUserId, networkId, donor, networkId)
            .run();

        const result = await this.db
            .prepare(`
                INSERT INTO wallet_links (
                    telegram_user_id, donor, network_id,
                    verified_at, signature, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `)
            .bind(telegramUserId, donor, networkId, ts, signature || null, now)
            .run();

        return this.getByTelegramAndNetwork(telegramUserId, networkId);
    }

    async getByTelegramAndNetwork(telegramUserId, networkId) {
        return await this.db
            .prepare(`
                SELECT * FROM wallet_links
                WHERE telegram_user_id = ? AND network_id = ?
                LIMIT 1
            `)
            .bind(telegramUserId, networkId)
            .first();
    }

    async listByTelegram(telegramUserId) {
        const result = await this.db
            .prepare(`
                SELECT * FROM wallet_links
                WHERE telegram_user_id = ?
                ORDER BY verified_at DESC
            `)
            .bind(telegramUserId)
            .all();
        return result.results || [];
    }

    async getByDonor(donor, networkId) {
        return await this.db
            .prepare(`
                SELECT * FROM wallet_links
                WHERE donor = ? AND network_id = ?
                LIMIT 1
            `)
            .bind(donor, networkId)
            .first();
    }

    async deleteLink({ telegramUserId, networkId, donor = null }) {
        if (donor) {
            await this.db
                .prepare(`
                    DELETE FROM wallet_links
                    WHERE telegram_user_id = ? AND network_id = ? AND donor = ?
                `)
                .bind(telegramUserId, networkId, donor)
                .run();
        } else {
            await this.db
                .prepare(`
                    DELETE FROM wallet_links
                    WHERE telegram_user_id = ? AND network_id = ?
                `)
                .bind(telegramUserId, networkId)
                .run();
        }
        return { ok: true };
    }

    async listAllLinkedDonors(limit = 500) {
        const result = await this.db
            .prepare(`
                SELECT * FROM wallet_links
                ORDER BY verified_at DESC
                LIMIT ?
            `)
            .bind(limit)
            .all();
        return result.results || [];
    }
}
