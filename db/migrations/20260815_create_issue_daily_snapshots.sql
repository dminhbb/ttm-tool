-- Long-retention, normalized daily history for every imported Epic, Story and Subtask.
-- This table deliberately has no cascading delete from raw import batches: it remains
-- available for historical alert analysis after raw import data is purged.
CREATE TABLE IF NOT EXISTS issue_daily_snapshots (
    id SERIAL PRIMARY KEY,
    issue_key VARCHAR(100) NOT NULL,
    issue_type VARCHAR(50) NOT NULL,
    issue_name TEXT,
    jira_id BIGINT,
    project_key VARCHAR(100),
    epic_key VARCHAR(100),
    parent_key VARCHAR(100),
    assignee_name VARCHAR(255),
    current_status VARCHAR(100),
    epic_complexity_type VARCHAR(20),
    requirement_level VARCHAR(100),
    idea_approved_date DATE,
    start_date DATE,
    r4g_date DATE,
    due_date DATE,
    target_r4g_date DATE,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    aggregated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (issue_key, aggregated_at)
);

CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_aggregated_at
    ON issue_daily_snapshots (aggregated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_type_aggregated_at
    ON issue_daily_snapshots (issue_type, aggregated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_epic_key_aggregated_at
    ON issue_daily_snapshots (epic_key, aggregated_at DESC)
    WHERE epic_key IS NOT NULL;

-- One-row configuration for automatic raw-import retention.
CREATE TABLE IF NOT EXISTS data_retention_configs (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    raw_import_retention_days INTEGER NOT NULL DEFAULT 30
        CHECK (raw_import_retention_days BETWEEN 7 AND 3650),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO data_retention_configs (id, raw_import_retention_days)
VALUES (1, 30)
ON CONFLICT (id) DO NOTHING;
