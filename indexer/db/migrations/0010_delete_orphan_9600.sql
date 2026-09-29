-- Hard-delete orphan project 9600 (not in Projects.json; only real project is 960).
-- 0009 only set active=0; /api/sync-status still listed the row and lag looked stuck.

DELETE FROM transfers
WHERE treasury_id IN (
  SELECT id FROM treasuries WHERE project_id = '9600'
);

DELETE FROM sync_state
WHERE treasury_id IN (
  SELECT id FROM treasuries WHERE project_id = '9600'
);

DELETE FROM treasuries
WHERE project_id = '9600';
