-- Recreates epic_alert_history EMPTY — its rows are not restored (epic_alert_timeline covers them).
CREATE TABLE IF NOT EXISTS epic_alert_history (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    alert_type VARCHAR(10) NOT NULL CHECK (alert_type IN ('LATE', 'FAIL')),
    alert_status VARCHAR(50) NOT NULL,
    alert_date DATE NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    phase VARCHAR(20) NOT NULL DEFAULT 'OVERALL',
    CONSTRAINT epic_alert_history_phase_check CHECK (phase IN ('OVERALL', 'DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE')),
    CONSTRAINT epic_alert_history_epic_key_alert_date_alert_type_phase_key UNIQUE (epic_key, alert_date, alert_type, phase)
);
CREATE INDEX IF NOT EXISTS idx_epic_alert_history_epic_key ON epic_alert_history (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_alert_history_alert_date ON epic_alert_history (alert_date);
