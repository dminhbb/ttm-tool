-- "Từ chối import" (Quản trị nguồn dữ liệu): Epics that must never enter the database, because the
-- Jira crawl cannot yet filter them out at the source (data scope: created >= 31/01/2026, Released /
-- MVP Done only when they got there after 30/06/2026, level-1 issue type Epic only — owner
-- 2026-10-14). The import pipeline drops every row of a listed Epic (the Epic, its Stories, their
-- Subtasks) — see import-admission-rules.ts / import-service.ts — and adding an Epic here runs the
-- Epic deletion (epic-deletion-service.ts) on whatever the database already holds of it.
--
-- The descriptive columns are captured when the Epic is added: after the deletion the database has
-- no other copy of them. allow_import = TRUE ("Cho phép import") keeps the row as an exemption from
-- the automatic rules instead of a denial.
CREATE TABLE IF NOT EXISTS denied_import_epics (
    epic_key VARCHAR(100) PRIMARY KEY,
    project_key VARCHAR(50),
    summary TEXT,
    status VARCHAR(100),
    requesting_unit VARCHAR(255),
    created_date DATE,
    idea_approved_date DATE,
    start_date DATE,
    r4g_date DATE,
    due_date DATE,
    allow_import BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'AUTO_RULE', 'SEED')),
    reason TEXT,
    added_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    last_deleted_at TIMESTAMPTZ,
    last_deleted_issue_count INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_denied_import_epics_project_key ON denied_import_epics (project_key);

-- Parameters of the automatic rules of the import adapter (one row, id = 1). A NULL date turns its
-- rule off.
--   created_before (A)      : an Epic created before A is denied.
--   released_due_before (B) : a Released / MVP Done Epic that got there before B is denied — until
--                             the crawl exports the date of the status change, its Due Date stands
--                             in for it (R4G Date when Due Date is empty).
CREATE TABLE IF NOT EXISTS import_admission_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    created_before DATE,
    released_due_before DATE,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO import_admission_settings (id, created_before, released_due_before)
VALUES (1, DATE '2026-01-31', DATE '2026-07-01')
ON CONFLICT (id) DO NOTHING;
