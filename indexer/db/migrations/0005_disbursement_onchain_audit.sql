-- Phase 6: on-chain multisig confirmation audit
ALTER TABLE disbursement_approvals ADD COLUMN onchain_tx_index INTEGER;
ALTER TABLE disbursement_approvals ADD COLUMN onchain_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_disbursement_approvals_tx
    ON disbursement_approvals(onchain_tx_hash);
