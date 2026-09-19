-- Phase 3: Wallet Linking + nonces
-- Additive only.

CREATE TABLE IF NOT EXISTS wallet_links (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id    TEXT NOT NULL,
    donor               TEXT NOT NULL,
    network_id          TEXT NOT NULL,
    verified_at         INTEGER NOT NULL,
    signature           TEXT,
    created_at          TEXT NOT NULL,
    UNIQUE(telegram_user_id, network_id),
    UNIQUE(donor, network_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_links_tg
    ON wallet_links(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_links_donor
    ON wallet_links(donor, network_id);

CREATE TABLE IF NOT EXISTS link_nonces (
    nonce               TEXT PRIMARY KEY,
    telegram_user_id    TEXT NOT NULL,
    network_id          TEXT NOT NULL,
    expires_at          INTEGER NOT NULL,
    used                INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_link_nonces_tg
    ON link_nonces(telegram_user_id, network_id);
