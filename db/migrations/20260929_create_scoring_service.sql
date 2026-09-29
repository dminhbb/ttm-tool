-- Epic Scoring Service (docs/superpowers/specs/2026-09-29-scoring-service-design.md, src/lib/scoring/).
-- Everything here is additive: the legacy engine keeps reading/writing its own columns unchanged
-- while the service runs side by side (shadow) and is compared against it (parity).

-- Tunable rule parameters — only admin overrides are stored; defaults live in
-- src/lib/scoring/parameters.ts (DEFAULT_SCORING_PARAMETERS).
CREATE TABLE IF NOT EXISTS scoring_parameters (
    param_key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- Per-badge on/off switch — no row = the badge's defaultEnabled in src/lib/scoring/catalog.ts.
CREATE TABLE IF NOT EXISTS scoring_rule_settings (
    badge_id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- Scorecard stored next to the legacy row (newest data layer only, like the rest of this cache).
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS badge_codes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS index_flags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS findings JSONB NOT NULL DEFAULT '[]';
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS scoring_ruleset_version TEXT;
ALTER TABLE epic_alert_row_cache ADD COLUMN IF NOT EXISTS scored_as_of DATE;
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_badge_codes ON epic_alert_row_cache USING GIN (badge_codes);
CREATE INDEX IF NOT EXISTS idx_epic_alert_row_cache_index_flags ON epic_alert_row_cache USING GIN (index_flags);

-- Parallel-run comparison results (scoring vs legacy engine), one row per run.
CREATE TABLE IF NOT EXISTS scoring_parity_runs (
    id SERIAL PRIMARY KEY,
    as_of DATE NOT NULL,
    source TEXT NOT NULL,
    ruleset_version TEXT NOT NULL,
    epic_count INT NOT NULL,
    identical_epics INT NOT NULL,
    intentional_only_epics INT NOT NULL,
    unexplained_epics INT NOT NULL,
    summary JSONB NOT NULL,
    duration_ms INT,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_scoring_parity_runs_computed_at ON scoring_parity_runs (computed_at DESC);
