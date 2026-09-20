CREATE TABLE IF NOT EXISTS treasuries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    project_id TEXT NOT NULL,
    network_id TEXT NOT NULL,
    address TEXT NOT NULL,

    active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE(project_id, network_id, address)
);


CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    treasury_id INTEGER NOT NULL,

    project_id TEXT NOT NULL,
    network_id TEXT NOT NULL,

    token TEXT NOT NULL,
    token_address TEXT NOT NULL,

    donor TEXT NOT NULL,

    amount_raw TEXT NOT NULL,
    amount TEXT NOT NULL,

    tx_hash TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    event_index INTEGER NOT NULL,

    timestamp INTEGER NOT NULL,

    transfer_uid TEXT NOT NULL UNIQUE,

    created_at TEXT NOT NULL,

    FOREIGN KEY (treasury_id)
        REFERENCES treasuries(id)
);


CREATE INDEX IF NOT EXISTS idx_transfers_treasury
    ON transfers(treasury_id);


CREATE INDEX IF NOT EXISTS idx_transfers_project
    ON transfers(project_id);


CREATE INDEX IF NOT EXISTS idx_transfers_donor
    ON transfers(donor);


CREATE INDEX IF NOT EXISTS idx_transfers_network
    ON transfers(network_id);


CREATE INDEX IF NOT EXISTS idx_transfers_block
    ON transfers(network_id, block_number);


CREATE TABLE IF NOT EXISTS sync_state (
    treasury_id INTEGER PRIMARY KEY,

    scan_from_block INTEGER NOT NULL DEFAULT 0,

    last_scanned_block INTEGER NOT NULL DEFAULT 0,

    last_finalized_block INTEGER NOT NULL DEFAULT 0,

    last_sync_at TEXT,

    status TEXT NOT NULL DEFAULT 'PENDING',

    error TEXT,

    FOREIGN KEY (treasury_id)
        REFERENCES treasuries(id)
);


CREATE INDEX IF NOT EXISTS idx_sync_status
    ON sync_state(status);

-- ============================================================
-- Phase 0 / Phase 1: Contribution Ledger + FIFO Queue
-- ============================================================

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

CREATE TABLE IF NOT EXISTS allocation_queue (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    donor                   TEXT NOT NULL,
    network_id              TEXT NOT NULL,
    amount_raw              TEXT NOT NULL,
    remaining_raw           TEXT NOT NULL,
    contribution_tx_hash    TEXT,
    contribution_timestamp  INTEGER NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'OPEN',
    transfer_uid            TEXT,
    created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_open
    ON allocation_queue(status, contribution_timestamp, id);

CREATE INDEX IF NOT EXISTS idx_queue_donor
    ON allocation_queue(donor, network_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_transfer_uid
    ON allocation_queue(transfer_uid);

-- ============================================================
-- Phase 2: Allocations + Voting
-- ============================================================

CREATE TABLE IF NOT EXISTS allocations (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_entry_id      INTEGER NOT NULL,
    project_id          TEXT NOT NULL,
    donor               TEXT NOT NULL,
    network_id          TEXT NOT NULL,
    amount_raw          TEXT NOT NULL,
    allocation_batch_id TEXT NOT NULL,
    allocated_at        INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    FOREIGN KEY (queue_entry_id) REFERENCES allocation_queue(id)
);

CREATE INDEX IF NOT EXISTS idx_allocations_project
    ON allocations(project_id);

CREATE INDEX IF NOT EXISTS idx_allocations_donor
    ON allocations(donor);

CREATE INDEX IF NOT EXISTS idx_allocations_batch
    ON allocations(allocation_batch_id);

CREATE TABLE IF NOT EXISTS voting_rounds (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL,
    candidate_projects  TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'OPEN',
    selected_project_id TEXT,
    required_amount_raw TEXT,
    network_id          TEXT,
    allocation_batch_id TEXT,
    opened_at           INTEGER NOT NULL,
    closed_at           INTEGER,
    allocated_at        INTEGER,
    created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id            INTEGER NOT NULL,
    donor               TEXT NOT NULL,
    network_id          TEXT NOT NULL,
    project_id          TEXT NOT NULL,
    telegram_user_id    TEXT,
    voted_at            INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    UNIQUE(round_id, donor, network_id),
    FOREIGN KEY (round_id) REFERENCES voting_rounds(id)
);

CREATE INDEX IF NOT EXISTS idx_votes_round
    ON votes(round_id);

-- ============================================================
-- Phase 3: Wallet Linking
-- ============================================================

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

-- ============================================================
-- Phase 4: Disbursements (on-chain transfer requests after FIFO allocate)
-- ============================================================

CREATE TABLE IF NOT EXISTS disbursements (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    allocation_batch_id     TEXT NOT NULL,
    project_id              TEXT NOT NULL,
    network_id              TEXT NOT NULL,
    from_address            TEXT NOT NULL,
    to_address              TEXT NOT NULL,
    amount_raw              TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    onchain_tx_index        INTEGER,
    execute_tx_hash         TEXT,
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

CREATE TABLE IF NOT EXISTS disbursement_approvals (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    disbursement_id     INTEGER NOT NULL,
    approver            TEXT NOT NULL,
    approved_at         INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    UNIQUE(disbursement_id, approver),
    FOREIGN KEY (disbursement_id) REFERENCES disbursements(id)
);

CREATE INDEX IF NOT EXISTS idx_disbursement_approvals_d
    ON disbursement_approvals(disbursement_id);
