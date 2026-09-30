-- ============================================================
-- 0010: remove obsolete General Pool black-hole treasury.
-- ============================================================

DELETE FROM allocation_queue
WHERE transfer_uid IN (
    SELECT transfer_uid
    FROM transfers
    WHERE treasury_id IN (
        SELECT id
        FROM treasuries
        WHERE project_id = 'GENERAL_POOL'
          AND network_id = 'tron_nile'
          AND address = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
    )
);

DELETE FROM transfers
WHERE treasury_id IN (
    SELECT id
    FROM treasuries
    WHERE project_id = 'GENERAL_POOL'
      AND network_id = 'tron_nile'
      AND address = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
);

DELETE FROM sync_state
WHERE treasury_id IN (
    SELECT id
    FROM treasuries
    WHERE project_id = 'GENERAL_POOL'
      AND network_id = 'tron_nile'
      AND address = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
);

DELETE FROM treasuries
WHERE project_id = 'GENERAL_POOL'
  AND network_id = 'tron_nile'
  AND address = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

-- Reset the already-created sync state for the new General Pool so the
-- first post-migration run starts at the first known incoming transfer.
UPDATE sync_state
SET scan_from_block = 71179889,
    last_scanned_block = 0,
    last_finalized_block = 0,
    last_sync_at = NULL,
    status = 'PENDING',
    error = NULL
WHERE treasury_id IN (
    SELECT id
    FROM treasuries
    WHERE project_id = 'GENERAL_POOL'
      AND network_id = 'tron_nile'
      AND address = 'TNpH6AyKJRLip6NEp6wjaTw3FbbduFD1hJ'
);
