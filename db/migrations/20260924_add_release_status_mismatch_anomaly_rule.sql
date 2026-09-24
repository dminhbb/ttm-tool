-- Adds 'RELEASE_STATUS_MISMATCH' (R7 — see EPIC_ANOMALY_RULE_INDEX, src/lib/epic-data-anomaly.ts)
-- alongside the existing 6 rule codes: Due Date on schedule against R4G Date + 5 working days, but
-- status hasn't reached Released yet — company rule change 2026-09-24 (TTM-E2E now measures
-- T0 → R4G Date; Due Date's own discipline against R4G Date is the new "trục Release").
ALTER TABLE epic_data_anomaly_violations DROP CONSTRAINT IF EXISTS epic_data_anomaly_violations_rule_code_check;
ALTER TABLE epic_data_anomaly_violations ADD CONSTRAINT epic_data_anomaly_violations_rule_code_check
  CHECK (rule_code IN (
    'MISSING_START_DATE', 'PENDING_TOO_LONG', 'DATE_OUT_OF_SEQUENCE',
    'MISSING_REQUEST_TYPE', 'MISSING_REQUIREMENT_LEVEL', 'SP_LEVEL_MISMATCH',
    'RELEASE_STATUS_MISMATCH'
  ));
