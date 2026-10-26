-- Two new Epic fields of the crawl tool (owner 2026-10-26), CSV columns "TTM-applied" and "except-TTM-plan"
-- (no epic_ prefix). Stored as the crawl sends them (free text); shown in Duyệt Epic -> Details. Not read by the
-- Scoring Service yet.
ALTER TABLE issues ADD COLUMN IF NOT EXISTS ttm_applied TEXT;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS except_ttm_plan TEXT;
