-- Phase 5: Telegram Community Sync
-- Additive only. Tracks configured groups and membership state.

CREATE TABLE IF NOT EXISTS telegram_groups (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    kind                TEXT NOT NULL,          -- GENERAL | PROJECT
    project_id          TEXT,                   -- NULL for GENERAL; ProjectID for project groups
    chat_id             TEXT NOT NULL UNIQUE,
    title               TEXT,
    invite_link         TEXT,
    active              INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_groups_kind_project
    ON telegram_groups(kind, project_id);

CREATE TABLE IF NOT EXISTS telegram_memberships (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id    TEXT NOT NULL,
    chat_id             TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | REMOVED | PENDING_INVITE
    last_synced_at      INTEGER,
    last_error          TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    UNIQUE(telegram_user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_tg_memberships_user
    ON telegram_memberships(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_tg_memberships_chat_status
    ON telegram_memberships(chat_id, status);

-- Real ClassChain General Pool supergroup.
INSERT OR IGNORE INTO telegram_groups
    (kind, project_id, chat_id, title, active, created_at, updated_at)
VALUES
    ('GENERAL', NULL, '-1003951313123', 'ClassChain General Pool', 1, datetime('now'), datetime('now'));
