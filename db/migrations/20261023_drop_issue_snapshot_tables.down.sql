-- Recreates the two retired tables EMPTY — their rows are not restored (they only duplicated `issues`).
CREATE TABLE IF NOT EXISTS epic_ttm_snapshots (
    id SERIAL PRIMARY KEY,
    epic_key VARCHAR(50) NOT NULL,
    epic_name TEXT,
    project_key VARCHAR(50),
    domain_id INT REFERENCES domains(id) ON DELETE SET NULL,
    assignee_name VARCHAR(100),
    current_status VARCHAR(50),
    epic_complexity_type VARCHAR(20),
    idea_approved_date DATE,
    start_date DATE,
    r4g_date DATE,
    due_date DATE,
    target_r4g_date DATE,
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE SET NULL,
    aggregated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    requirement_level VARCHAR(100),
    requesting_unit VARCHAR(255),
    UNIQUE (epic_key, aggregated_at)
);
CREATE INDEX IF NOT EXISTS idx_epic_ttm_snapshots_epic_key ON epic_ttm_snapshots (epic_key);
CREATE INDEX IF NOT EXISTS idx_epic_ttm_snapshots_aggregated_at ON epic_ttm_snapshots (aggregated_at);

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (issue_key, aggregated_at)
);
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_aggregated_at ON issue_daily_snapshots (aggregated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_type_aggregated_at ON issue_daily_snapshots (issue_type, aggregated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_epic_key_aggregated_at ON issue_daily_snapshots (epic_key, aggregated_at DESC) WHERE epic_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_parent_key ON issue_daily_snapshots (parent_key) WHERE parent_key IS NOT NULL;
