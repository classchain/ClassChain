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
