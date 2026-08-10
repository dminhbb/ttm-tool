-- Up migration: configurable MVP1 TTM-CNTT alert rules for Epic status.
CREATE TABLE IF NOT EXISTS epic_status_alert_rules (
    id SERIAL PRIMARY KEY,
    epic_complexity_type VARCHAR(20) NOT NULL CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX')),
    epic_status VARCHAR(50) NOT NULL CHECK (epic_status IN ('Design', 'In Progress')),
    early_alert_offset_days INT NOT NULL CHECK (early_alert_offset_days >= 0),
    late_alert_offset_days INT NOT NULL CHECK (late_alert_offset_days >= 0),
    fail_offset_days INT NOT NULL CHECK (fail_offset_days >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_epic_status_alert_rules_complexity_status UNIQUE (epic_complexity_type, epic_status),
    CONSTRAINT chk_epic_status_alert_rules_offsets CHECK (
        early_alert_offset_days < late_alert_offset_days
        AND late_alert_offset_days < fail_offset_days
    )
);

CREATE INDEX IF NOT EXISTS idx_epic_status_alert_rules_active
    ON epic_status_alert_rules (is_active)
    WHERE is_active;

INSERT INTO epic_status_alert_rules (
    epic_complexity_type, epic_status, early_alert_offset_days, late_alert_offset_days, fail_offset_days
) VALUES
    ('SIMPLE', 'Design', 2, 3, 15),
    ('SIMPLE', 'In Progress', 12, 13, 15),
    ('COMPLEX', 'Design', 5, 6, 30),
    ('COMPLEX', 'In Progress', 19, 20, 30)
ON CONFLICT (epic_complexity_type, epic_status) DO NOTHING;
