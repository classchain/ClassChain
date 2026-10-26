-- Manual reconciliation audit trail for production ledger recovery.
-- IF NOT EXISTS supports the already-created production table without data loss.
CREATE TABLE IF NOT EXISTS reconciliation_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action      TEXT NOT NULL,
    network_id  TEXT,
    tx_hash     TEXT,
    entity_ref  TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json  TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_audit_tx
    ON reconciliation_audit(tx_hash);
