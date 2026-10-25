-- The Rule Group that judged each cached Epic (spec 2026-10-25 §9.2) — filter/page by it in SQL. NULL = an
-- "Epic ngoại lệ" (not judged) or a row written before this column existed.
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS rule_group_id INTEGER;
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS rule_group_name TEXT;
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_rule_group ON epic_alert_row_cache (rule_group_id);
