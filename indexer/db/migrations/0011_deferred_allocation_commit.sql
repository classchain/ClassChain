-- Deferred ledger commit: allocations may be PLANNED until money moves on-chain.
-- Round stays CLOSED until all related disbursements are EXECUTED, then ALLOCATED.

ALTER TABLE allocations ADD COLUMN status TEXT NOT NULL DEFAULT 'COMMITTED';
-- PLANNED  = FIFO plan recorded, queue/balance NOT yet consumed
-- COMMITTED = queue reduced + unallocated debited (after on-chain EXECUTED)

CREATE INDEX IF NOT EXISTS idx_allocations_batch_status
    ON allocations(allocation_batch_id, status);
