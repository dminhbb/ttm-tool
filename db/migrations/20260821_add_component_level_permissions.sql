-- Epic's own Component/s (Jira field), captured per-issue so Epic 30/15/in-PO can filter/restrict
-- by it. Populated from epic_components (Epic rows) / story_components (Story rows) at import time
-- — see import-service.ts and py-jira-api-adapter.ts.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS components TEXT[];

-- Component-level narrowing of a user's per-project (PM/SM) permission — user_projects already
-- grants full access to a project; a row here for (user_id, project_id) narrows that project down
-- to only epics whose `components` intersects the listed component names. No rows for a granted
-- project = unrestricted (full project access), matching the existing user_projects behavior.
CREATE TABLE IF NOT EXISTS user_project_components (
    user_id INT NOT NULL,
    project_id INT NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, project_id, component_name),
    FOREIGN KEY (user_id, project_id) REFERENCES user_projects (user_id, project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_project_components_lookup ON user_project_components (user_id, project_id);
