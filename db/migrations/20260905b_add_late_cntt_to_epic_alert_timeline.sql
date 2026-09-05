-- Adds 'LATE_TTM_CNTT' (Cảnh báo muộn) alongside the existing 'FAIL_TTM_CNTT' run type — same
-- evaluation.alertLevel used at import time, just the 'LATE' tier instead of 'FAIL'. See
-- epic-alert-timeline-service.ts / import-service.ts.
ALTER TABLE epic_alert_timeline DROP CONSTRAINT IF EXISTS epic_alert_timeline_alert_type_check;
ALTER TABLE epic_alert_timeline ADD CONSTRAINT epic_alert_timeline_alert_type_check
  CHECK (alert_type IN ('FAIL_TTM_CNTT', 'LATE_TTM_CNTT', 'FAIL_TTM_E2E', 'MISSING_START_DATE', 'DATA_ANOMALY'));
