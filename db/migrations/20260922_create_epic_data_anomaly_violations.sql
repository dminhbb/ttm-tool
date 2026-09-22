-- Current-state, per-rule storage for "Epic bị sai lệch dữ liệu" (see epic-data-anomaly.ts,
-- rule set revised 2026-09-22 — R1..R6). One row per (epic_key, rule_code) currently violated;
-- refreshed on every aggregateBatchData() run (import-service.ts / epic-data-anomaly-storage-
-- service.ts): a rule that stops applying to an Epic has its row DELETEd, not closed — unlike
-- epic_alert_timeline this is a snapshot, not a run history. rule_index lets stats be grouped by
-- rule without depending on rule_code text or message wording (see EPIC_ANOMALY_RULE_INDEX).
CREATE TABLE IF NOT EXISTS epic_data_anomaly_violations (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    rule_code VARCHAR(40) NOT NULL CHECK (rule_code IN (
        'MISSING_START_DATE', 'PENDING_TOO_LONG', 'DATE_OUT_OF_SEQUENCE',
        'MISSING_REQUEST_TYPE', 'MISSING_REQUIREMENT_LEVEL', 'SP_LEVEL_MISMATCH'
    )),
    rule_index SMALLINT NOT NULL,
    message TEXT NOT NULL,
    detected_at DATE NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (epic_key, rule_code)
);

-- Powers "thống kê theo từng nhóm rule" (GROUP BY rule_code / rule_index).
CREATE INDEX IF NOT EXISTS idx_epic_data_anomaly_violations_rule_code ON epic_data_anomaly_violations (rule_code);
CREATE INDEX IF NOT EXISTS idx_epic_data_anomaly_violations_epic_key ON epic_data_anomaly_violations (epic_key);
