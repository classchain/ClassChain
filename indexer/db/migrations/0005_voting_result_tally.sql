-- Phase 6: admin-recorded Telegram voting result
-- The actual vote is conducted outside the admin panel (Telegram).
-- Store the final per-project tally on the round for auditability.
ALTER TABLE voting_rounds ADD COLUMN result_tally TEXT NOT NULL DEFAULT '[]';
