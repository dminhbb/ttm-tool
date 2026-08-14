-- Accumulated, one-shot-per-milestone record of when an Epic reached an important internal
-- milestone (e.g. "all BA subtasks Done" → DESIGN_DONE), distinct from epic_alert_history (which
-- only tracks Cảnh báo muộn/Fail TTM events). Unique per (epic_key, milestone) — once a milestone
-- date is recorded it is never overwritten, so it stays pinned to the day it was first detected
-- rather than drifting forward on every later re-run.
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
