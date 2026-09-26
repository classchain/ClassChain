-- Phase 4: On-chain disbursement requests (FIFO order preserved in allocation slices)
-- After allocate: system creates one disbursement per network for treasury owners to approve.

CREATE TABLE IF NOT EXISTS disbursements (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    allocation_batch_id     TEXT NOT NULL,
    project_id              TEXT NOT NULL,
    network_id              TEXT NOT NULL,

    from_address            TEXT NOT NULL,   -- GENERAL_POOL treasury on this network
    to_address              TEXT NOT NULL,   -- project.funds[network].address

    amount_raw              TEXT NOT NULL,   -- sum of FIFO slices on this network

    status                  TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    -- PENDING_APPROVAL | APPROVED | EXECUTED | FAILED | NO_DESTINATION

    onchain_tx_index        INTEGER,         -- MultiSig submit index (when applicable)
    execute_tx_hash         TEXT,            -- final on-chain transfer hash
    error                   TEXT,

    required_signatures     INTEGER NOT NULL DEFAULT 1,
    confirmations_count     INTEGER NOT NULL DEFAULT 0,

    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    executed_at             INTEGER,

    UNIQUE(allocation_batch_id, network_id)
);

CREATE INDEX IF NOT EXISTS idx_disbursements_status
    ON disbursements(status);

CREATE INDEX IF NOT EXISTS idx_disbursements_batch
    ON disbursements(allocation_batch_id);

CREATE INDEX IF NOT EXISTS idx_disbursements_project
    ON disbursements(project_id, network_id);

-- Optional: who approved (for multi-sig tracking in DB before/while on-chain)
CREATE TABLE IF NOT EXISTS disbursement_approvals (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    disbursement_id     INTEGER NOT NULL,
    approver            TEXT NOT NULL,       -- wallet address of treasury owner
    approved_at         INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    UNIQUE(disbursement_id, approver),
    FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
);

CREATE INDEX IF NOT EXISTS idx_disbursement_approvals_d
    ON disbursement_approvals(disbursement_id);
