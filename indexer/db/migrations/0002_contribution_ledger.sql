-- Phase 0 / Phase 1: Contribution Ledger + FIFO Queue
-- Additive only. Does not modify existing tables.

-- Aggregated balance per donor in the general treasury
CREATE TABLE IF NOT EXISTS contribution_balances (
    donor               TEXT NOT NULL,
    network_id          TEXT NOT NULL,
    total_contributed   TEXT NOT NULL DEFAULT '0',
    total_allocated     TEXT NOT NULL DEFAULT '0',
    unallocated         TEXT NOT NULL DEFAULT '0',
    first_at            INTEGER,
    last_at             INTEGER,
    updated_at          TEXT NOT NULL,
    PRIMARY KEY (donor, network_id)
);

-- FIFO queue of unallocated contribution slices
CREATE TABLE IF NOT EXISTS allocation_queue (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    donor                   TEXT NOT NULL,
    network_id              TEXT NOT NULL,
    amount_raw              TEXT NOT NULL,
    remaining_raw           TEXT NOT NULL,
    contribution_tx_hash    TEXT,
    contribution_timestamp  INTEGER NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | PARTIAL | FULL
    transfer_uid            TEXT,                           -- link back to transfers.transfer_uid
    created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_open
    ON allocation_queue(status, contribution_timestamp, id);

CREATE INDEX IF NOT EXISTS idx_queue_donor
    ON allocation_queue(donor, network_id);

-- Non-partial unique index so ON CONFLICT (transfer_uid) works reliably in D1/SQLite.
-- Multiple NULLs are still allowed (SQLite treats NULLs as distinct in UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_transfer_uid
    ON allocation_queue(transfer_uid);

-- Placeholder for Phase 2 (kept empty for forward compatibility)
-- CREATE TABLE IF NOT EXISTS allocations (...);
