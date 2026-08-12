-- Accumulated, append-only history of Epic status alerts (Cảnh báo muộn / Fail TTM),
-- computed once per import batch against the epic_status_alert_rules configured for the
-- Epic's status as of that import (aggregated_at is used as "today" for the calculation).
-- Never overwritten across days (only re-computed if the same epic/day/type combination is
-- re-imported), so it is a durable audit trail linked to the Epic via epic_key — the same
-- linking key used by epic_ttm_snapshots, the canonical compact Epic-level table.
CREATE TABLE IF NOT EXISTS epic_alert_history (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    alert_type VARCHAR(10) NOT NULL CHECK (alert_type IN ('LATE', 'FAIL')),
    alert_status VARCHAR(50) NOT NULL,
    alert_date DATE NOT NULL,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (epic_key, alert_date, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_epic_alert_history_epic_key ON epic_alert_history (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_alert_history_alert_date ON epic_alert_history (alert_date);
