ALTER TABLE issues ADD COLUMN IF NOT EXISTS requirement_level VARCHAR(100);
ALTER TABLE epic_ttm_snapshots ADD COLUMN IF NOT EXISTS requirement_level VARCHAR(100);
