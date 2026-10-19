-- Epic deletion / "Từ chối import" (epic-deletion-service.ts resolveEpicDeletionScope) — 2026-10-19.
-- The scope query now starts from the rows that point at the Epics (epic_key) or at their Stories
-- (parent_key) instead of computing the newest state of EVERY issue; these indexes let it do that
-- without a sequential scan of issues / issue_daily_snapshots (≈63k rows each on Supabase, growing
-- with every import) inside the import transaction.
CREATE INDEX IF NOT EXISTS idx_issues_epic_key_aggregated_at
    ON issues (epic_key, aggregated_at DESC) WHERE epic_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_parent_key
    ON issues (parent_key) WHERE parent_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issue_daily_snapshots_parent_key
    ON issue_daily_snapshots (parent_key) WHERE parent_key IS NOT NULL;
