-- Phase 5: network-agnostic voting
-- Voting is one choice per donor per round. Network is resolved only
-- during financial allocation, so vote submission must not require it.

CREATE TABLE IF NOT EXISTS votes_v2 (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id            INTEGER NOT NULL,
    donor               TEXT NOT NULL,
    network_id          TEXT,
    project_id          TEXT NOT NULL,
    telegram_user_id    TEXT,
    voted_at            INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    UNIQUE(round_id, donor),
    FOREIGN KEY (round_id) REFERENCES voting_rounds(id)
);

-- Preserve the latest vote when old data contains multiple network rows
-- for the same donor in one round.
INSERT OR REPLACE INTO votes_v2 (
    id,
    round_id,
    donor,
    network_id,
    project_id,
    telegram_user_id,
    voted_at,
    created_at
)
SELECT v.id, v.round_id, v.donor, NULL, v.project_id,
       v.telegram_user_id, v.voted_at, v.created_at
FROM votes v
WHERE v.id IN (
    SELECT MAX(id)
    FROM votes
    GROUP BY round_id, donor
);

DROP TABLE votes;

ALTER TABLE votes_v2 RENAME TO votes;

CREATE INDEX IF NOT EXISTS idx_votes_round
    ON votes(round_id);

CREATE INDEX IF NOT EXISTS idx_votes_donor
    ON votes(donor);
