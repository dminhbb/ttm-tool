-- "Đơn vị yêu cầu" (epic_requesting_unit in the Py Jira API CSV) — epic-only descriptive field.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS requesting_unit VARCHAR(255);
ALTER TABLE epic_ttm_snapshots ADD COLUMN IF NOT EXISTS requesting_unit VARCHAR(255);
