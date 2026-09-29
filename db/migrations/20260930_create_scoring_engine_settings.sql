-- Epic Scoring Service (M4): which engine the screens display — 'legacy' (old evaluation code) or
-- 'scoring' (src/lib/scoring projected onto the same row shape). Switchable by SUPERADMIN without a
-- deploy (Quản trị nguồn dữ liệu → "Đối chiếu Scoring Service"); flipping it rebuilds the caches.
-- Singleton row (id fixed to 1), same pattern as ttm_scope_config. Starts at 'legacy' so nothing
-- changes for users until an admin switches it on.
CREATE TABLE IF NOT EXISTS scoring_engine_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'legacy' CHECK (mode IN ('legacy', 'scoring')),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO scoring_engine_settings (id, mode) VALUES (1, 'legacy') ON CONFLICT (id) DO NOTHING;
