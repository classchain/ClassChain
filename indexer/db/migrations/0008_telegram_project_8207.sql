-- Phase 5: register the real Telegram supergroup for Project 8207.
-- Idempotent: safe to apply after the existing Telegram migrations.

INSERT OR IGNORE INTO telegram_groups
    (kind, project_id, chat_id, title, active, created_at, updated_at)
VALUES
    ('PROJECT', '8207', '-1004420189763', 'ClassChain_8207', 1, datetime('now'), datetime('now'));
