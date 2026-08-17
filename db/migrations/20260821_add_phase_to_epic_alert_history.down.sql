ALTER TABLE epic_alert_history DROP CONSTRAINT IF EXISTS epic_alert_history_epic_key_alert_date_alert_type_phase_key;
ALTER TABLE epic_alert_history ADD CONSTRAINT epic_alert_history_epic_key_alert_date_alert_type_key UNIQUE (epic_key, alert_date, alert_type);
ALTER TABLE epic_alert_history DROP CONSTRAINT IF EXISTS epic_alert_history_phase_check;
ALTER TABLE epic_alert_history DROP COLUMN IF EXISTS phase;
