CREATE TABLE IF NOT EXISTS visit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL, -- 'APP_LOGIN' | 'SCREEN_VIEW'
    screen_key VARCHAR(50),          -- 'dashboard' | 'epic_alerts' | 'epic_reports' | 'epic_in_po' | NULL
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_type_created ON visit_logs (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_screen_created ON visit_logs (screen_key, created_at);
CREATE INDEX IF NOT EXISTS idx_visit_logs_user_created ON visit_logs (user_id, created_at);
