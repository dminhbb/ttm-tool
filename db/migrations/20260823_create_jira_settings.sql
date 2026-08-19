-- Single-row app-wide config for Jira integration URLs (see "Quản lý chung" → "Cấu hình Jira").
-- api_base_url: reserved for future direct Jira API calls. view_issue_base_url: prefix concatenated
-- directly with an Epic key to build the "open in Jira" link on the Epic Alerts screens (e.g.
-- "https://jira.mbbank.com.vn/browse/" + "HCM-172837").
CREATE TABLE IF NOT EXISTS jira_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    api_base_url VARCHAR(500) NOT NULL DEFAULT '',
    view_issue_base_url VARCHAR(500) NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO jira_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
