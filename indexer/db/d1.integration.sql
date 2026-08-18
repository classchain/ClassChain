INSERT INTO treasuries (
    project_id,
    network_id,
    address,
    active,
    created_at,
    updated_at
)
VALUES (
    'TEST_PROJECT',
    'tron_nile',
    'TEST_TREASURY',
    1,
    datetime('now'),
    datetime('now')
);

INSERT INTO transfers (
    treasury_id,
    project_id,
    network_id,
    token,
    token_address,
    donor,
    amount_raw,
    amount,
    tx_hash,
    block_number,
    event_index,
    timestamp,
    transfer_uid,
    created_at
)
SELECT
    id,
    'TEST_PROJECT',
    'tron_nile',
    'USDT',
    'TEST_TOKEN',
    'TEST_DONOR',
    '10000000',
    '10',
    'TEST_TX',
    123456,
    0,
    1700000000,
    'tron_nile:test_tx:0',
    datetime('now')
FROM treasuries
WHERE project_id = 'TEST_PROJECT'
  AND network_id = 'tron_nile'
  AND address = 'TEST_TREASURY';

INSERT INTO sync_state (
    treasury_id,
    scan_from_block,
    last_scanned_block,
    last_finalized_block,
    last_sync_at,
    status,
    error
)
SELECT
    id,
    123000,
    123456,
    123450,
    datetime('now'),
    'SUCCESS',
    NULL
FROM treasuries
WHERE project_id = 'TEST_PROJECT'
  AND network_id = 'tron_nile'
  AND address = 'TEST_TREASURY';


SELECT
    'TREASURY' AS test,
    COUNT(*) AS count
FROM treasuries
WHERE project_id = 'TEST_PROJECT'

UNION ALL

SELECT
    'TRANSFER',
    COUNT(*)
FROM transfers
WHERE transfer_uid = 'tron_nile:test_tx:0'

UNION ALL

SELECT
    'SYNC_STATE',
    COUNT(*)
FROM sync_state
WHERE treasury_id = (
    SELECT id
    FROM treasuries
    WHERE project_id = 'TEST_PROJECT'
      AND network_id = 'tron_nile'
      AND address = 'TEST_TREASURY'
);
