-- Deactivate orphan treasury project 9600 (not in Projects.json).
-- Address TLbiQrFZCfb3bQR5e2GefctX5zsaZTN6BH was left in D1 from an old registry
-- and stuck at scan_from/last_scanned = 0 (Tron cannot resolve timestamp for block 0).

UPDATE treasuries
SET active = 0,
    updated_at = datetime('now')
WHERE project_id = '9600'
  AND network_id = 'tron_nile'
  AND address = 'TLbiQrFZCfb3bQR5e2GefctX5zsaZTN6BH';

UPDATE sync_state
SET last_scanned_block = 71355400,
    last_finalized_block = 71355400,
    last_sync_at = datetime('now'),
    status = 'SUCCESS',
    error = NULL
WHERE treasury_id IN (
  SELECT id FROM treasuries
  WHERE project_id = '9600'
    AND network_id = 'tron_nile'
    AND address = 'TLbiQrFZCfb3bQR5e2GefctX5zsaZTN6BH'
);
