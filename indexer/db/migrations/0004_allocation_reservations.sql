-- Phase 5: FIFO allocation reservations
-- Planning reserves queue capacity without consuming balances or queue remaining.
-- Existing allocations are already committed and remain untouched.

ALTER TABLE allocations
    ADD COLUMN allocation_status TEXT NOT NULL DEFAULT 'COMMITTED';

CREATE INDEX IF NOT EXISTS idx_allocations_status_batch
    ON allocations(allocation_status, allocation_batch_id);
