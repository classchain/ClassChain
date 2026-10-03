-- Resumable TRON TRC20 pagination state.
-- Safe to apply once through Wrangler D1 migrations.
ALTER TABLE sync_state ADD COLUMN tron_cursor TEXT;
ALTER TABLE sync_state ADD COLUMN tron_cursor_min_timestamp INTEGER;
ALTER TABLE sync_state ADD COLUMN tron_cursor_max_timestamp INTEGER;
ALTER TABLE sync_state ADD COLUMN tron_cursor_offset INTEGER NOT NULL DEFAULT 0;
