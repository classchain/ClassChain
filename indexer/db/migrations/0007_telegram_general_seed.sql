-- Phase 5: ensure the real General Pool supergroup is registered.
-- Idempotent so it is safe whether 0006 was already applied or not.

INSERT OR IGNORE INTO telegram_groups
    (kind, project_id, chat_id, title, active, created_at, updated_at)
VALUES
    ('GENERAL', NULL, '-1003951313123', 'ClassChain General Pool', 1, datetime('now'), datetime('now'));
