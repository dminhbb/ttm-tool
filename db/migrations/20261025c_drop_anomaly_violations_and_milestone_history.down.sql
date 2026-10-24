-- Recreates the two retired tables EMPTY — their rows are not restored.
CREATE TABLE IF NOT EXISTS epic_data_anomaly_violations (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    rule_code VARCHAR(40) NOT NULL CHECK (rule_code IN ('MISSING_START_DATE', 'PENDING_TOO_LONG', 'DATE_OUT_OF_SEQUENCE', 'MISSING_REQUEST_TYPE', 'MISSING_REQUIREMENT_LEVEL', 'SP_LEVEL_MISMATCH', 'RELEASE_STATUS_MISMATCH')),
    rule_index SMALLINT NOT NULL,
    message TEXT NOT NULL,
    detected_at DATE NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (epic_key, rule_code)
);
CREATE INDEX IF NOT EXISTS idx_epic_data_anomaly_violations_epic_key ON epic_data_anomaly_violations (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_data_anomaly_violations_rule_code ON epic_data_anomaly_violations (rule_code);

CREATE TABLE IF NOT EXISTS epic_milestone_history (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    milestone VARCHAR(30) NOT NULL,
    milestone_date DATE NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (epic_key, milestone)
);
CREATE INDEX IF NOT EXISTS idx_epic_milestone_history_epic_key ON epic_milestone_history (epic_key);
