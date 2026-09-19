-- Phase 2: Allocations + Voting rounds
-- Additive only.

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
    candidate_projects  TEXT NOT NULL,          -- JSON array of project_ids
    status              TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN | CLOSED | ALLOCATED
    selected_project_id TEXT,
    required_amount_raw TEXT,
    network_id          TEXT,                   -- optional: allocate from one network only
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
