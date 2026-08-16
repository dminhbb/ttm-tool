-- Configurable mapping from a Jira issue type (e.g. "BA", "Design", "UAT") to the team role
-- (BA/DEV/TEST/PM) it represents. Used to classify subtasks by team role instead of hardcoding
-- issue-type literals in service code (see epic-milestone-history-service.ts's 'BA' check).
CREATE TABLE IF NOT EXISTS issue_type_role_mapping (
    id SERIAL PRIMARY KEY,
    issue_type VARCHAR(100) NOT NULL,
    team_role VARCHAR(10) NOT NULL CHECK (team_role IN ('BA', 'DEV', 'TEST', 'PM')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (issue_type)
);
CREATE INDEX IF NOT EXISTS idx_issue_type_role_mapping_role ON issue_type_role_mapping (team_role);

INSERT INTO issue_type_role_mapping (issue_type, team_role) VALUES
    ('BA', 'BA'),
    ('DEV', 'DEV'),
    ('Design', 'DEV'),
    ('Review TKCT', 'DEV'),
    ('Sub test execution', 'TEST'),
    ('UAT', 'TEST'),
    ('KSTĐ', 'TEST')
ON CONFLICT (issue_type) DO NOTHING;
