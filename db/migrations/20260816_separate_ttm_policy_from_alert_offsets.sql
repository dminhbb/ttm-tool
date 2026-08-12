-- Status alert rules contain only early/late warning offsets. The TTM deadline is
-- maintained independently as a From/To working-day policy.
ALTER TABLE epic_status_alert_rules DROP CONSTRAINT IF EXISTS chk_epic_status_alert_rules_offsets;
ALTER TABLE epic_status_alert_rules DROP COLUMN IF EXISTS fail_offset_days;

CREATE TABLE IF NOT EXISTS ttm_policy_configs (
    id SERIAL PRIMARY KEY,
    ttm_type VARCHAR(20) NOT NULL CHECK (ttm_type IN ('TTM_CNTT', 'TTM_E2E')),
    epic_complexity_type VARCHAR(20) NOT NULL CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX')),
    from_ttm_field VARCHAR(40) NOT NULL CHECK (from_ttm_field IN ('IDEA_APPROVED_DATE', 'START_DATE')),
    to_ttm_field VARCHAR(40) NOT NULL CHECK (to_ttm_field IN ('R4G_DATE', 'DUE_DATE')),
    working_days INT NOT NULL CHECK (working_days > 0 AND working_days <= 3650),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ttm_policy_configs_type_complexity UNIQUE (ttm_type, epic_complexity_type)
);

INSERT INTO ttm_policy_configs (ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active)
VALUES
    ('TTM_CNTT', 'SIMPLE', 'START_DATE', 'R4G_DATE', 15, TRUE),
    ('TTM_CNTT', 'COMPLEX', 'START_DATE', 'R4G_DATE', 30, TRUE),
    ('TTM_E2E', 'SIMPLE', 'IDEA_APPROVED_DATE', 'DUE_DATE', 30, TRUE),
    ('TTM_E2E', 'COMPLEX', 'IDEA_APPROVED_DATE', 'DUE_DATE', 50, TRUE)
ON CONFLICT (ttm_type, epic_complexity_type) DO NOTHING;
