-- "Epic ngoại lệ" (black listed Epics): Epics an admin takes out of every Time to Market
-- calculation — the TTM Dashboard 2 funnel from L02 on, TTM-CNTT (QLDA/QA) and TTM-E2E. Maintained
-- from the "Epic ngoại lệ" popup (one line per project: KEY:EPIC-1,EPIC-2) and from the form in
-- Duyệt Epic. One row per Epic; an Epic that is no longer black listed has its row DELETED, so a
-- missing row always means "TTM Black listed = false". See black-listed-epic-service.ts.
CREATE TABLE IF NOT EXISTS black_listed_epics (
    epic_key VARCHAR(100) PRIMARY KEY,
    project_key VARCHAR(50) NOT NULL,
    ttm_black_listed BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_black_listed_epics_project_key ON black_listed_epics (project_key);
