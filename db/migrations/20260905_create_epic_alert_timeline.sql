-- Transition-based history for Epic alert badges (Fail TTM-CNTT, Fail TTM-E2E, thiếu Start Date,
-- dữ liệu bất thường): unlike epic_alert_history (one row per epic/day/type), this stores one row
-- per continuous RUN of a given alert type. start_date/end_date span the run; end_date IS NULL
-- means the run is still open as of the most recent import. last_seen_date tracks the most recent
-- import day the run was confirmed still active, so a run can be closed at the right date even if
-- an import is skipped for a day — see epic-alert-timeline-service.ts, which diffs each import
-- batch's evaluated alert state against the currently open run per epic/alert_type and applies the
-- transition in at most 3 batched statements (never one round trip per epic), same connection-cap
-- concern as ALERT_HISTORY_RECORDING_ENABLED in epic-alert-phase-service.ts. Powers the alert
-- timeline shown in "Epic History" (Quản trị Epic đầy đủ / Epic in PO).
CREATE TABLE IF NOT EXISTS epic_alert_timeline (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    alert_type VARCHAR(20) NOT NULL CHECK (alert_type IN ('FAIL_TTM_CNTT', 'FAIL_TTM_E2E', 'MISSING_START_DATE', 'DATA_ANOMALY')),
    start_date DATE NOT NULL,
    last_seen_date DATE NOT NULL,
    end_date DATE,
    detail JSONB,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_epic_alert_timeline_epic_key ON epic_alert_timeline (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_alert_timeline_end_date ON epic_alert_timeline (end_date);
-- Only one OPEN run per epic + alert_type at a time — the diff logic in
-- epic-alert-timeline-service.ts relies on this to find "the" open run to continue/close.
CREATE UNIQUE INDEX IF NOT EXISTS idx_epic_alert_timeline_open_run ON epic_alert_timeline (epic_key, alert_type) WHERE end_date IS NULL;
