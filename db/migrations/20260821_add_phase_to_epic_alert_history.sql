-- Epic 15's per-component-phase alerts (DEV/TEST/PENTEST late alerts, computed on screen view —
-- see epic-alert-phase-service.ts) need their own history entries distinct from the Epic-level
-- LATE/FAIL alert already recorded at import time (epic_status_alert_rules-based, unchanged).
-- 'OVERALL' preserves the existing one-row-per-epic-per-day behavior for those pre-existing rows.
ALTER TABLE epic_alert_history ADD COLUMN IF NOT EXISTS phase VARCHAR(20) NOT NULL DEFAULT 'OVERALL';

ALTER TABLE epic_alert_history DROP CONSTRAINT IF EXISTS epic_alert_history_phase_check;
ALTER TABLE epic_alert_history ADD CONSTRAINT epic_alert_history_phase_check CHECK (phase IN ('OVERALL', 'DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE'));

ALTER TABLE epic_alert_history DROP CONSTRAINT IF EXISTS epic_alert_history_epic_key_alert_date_alert_type_key;
ALTER TABLE epic_alert_history ADD CONSTRAINT epic_alert_history_epic_key_alert_date_alert_type_phase_key UNIQUE (epic_key, alert_date, alert_type, phase);
