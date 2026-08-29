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
