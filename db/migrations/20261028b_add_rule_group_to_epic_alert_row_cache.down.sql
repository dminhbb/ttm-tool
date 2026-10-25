DROP INDEX IF EXISTS idx_epic_alert_row_cache_rule_group;
ALTER TABLE epic_alert_row_cache DROP COLUMN IF EXISTS rule_group_name;
ALTER TABLE epic_alert_row_cache DROP COLUMN IF EXISTS rule_group_id;
