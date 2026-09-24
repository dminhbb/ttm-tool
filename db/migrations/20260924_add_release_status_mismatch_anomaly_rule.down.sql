ALTER TABLE epic_data_anomaly_violations DROP CONSTRAINT IF EXISTS epic_data_anomaly_violations_rule_code_check;
ALTER TABLE epic_data_anomaly_violations ADD CONSTRAINT epic_data_anomaly_violations_rule_code_check
  CHECK (rule_code IN (
    'MISSING_START_DATE', 'PENDING_TOO_LONG', 'DATE_OUT_OF_SEQUENCE',
    'MISSING_REQUEST_TYPE', 'MISSING_REQUIREMENT_LEVEL', 'SP_LEVEL_MISMATCH'
  ));
