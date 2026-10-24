-- Recreates scoring_parity_runs EMPTY and scoring_engine_settings with its default row.
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

CREATE TABLE IF NOT EXISTS scoring_engine_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy', 'scoring')),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO scoring_engine_settings (id, mode) VALUES (1, 'scoring') ON CONFLICT (id) DO NOTHING;
