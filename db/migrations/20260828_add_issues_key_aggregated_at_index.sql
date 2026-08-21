-- Every "latest known state of this issue" query in the app (LATEST_ISSUES_CTE in
-- issue-resolution-sql.ts — Epic Browser, milestone computation, data-completion detection, …)
-- runs `SELECT DISTINCT ON (issue_key) ... ORDER BY issue_key, aggregated_at DESC` over the WHOLE
-- issues table with no supporting index, forcing a full scan + sort on every call — including once
-- per Epic Browser expand click. This composite index lets Postgres satisfy that DISTINCT ON via
-- an index skip-scan instead.
CREATE INDEX IF NOT EXISTS idx_issues_key_aggregated_at ON issues (issue_key, aggregated_at DESC);
