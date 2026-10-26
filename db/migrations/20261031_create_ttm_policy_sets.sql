-- "Bộ ngân sách" (budget set, spec 2026-10-25 §17 / GĐ4): a named set of "Tiêu chí Time to Market" rows. A set only
-- holds the rows that differ from DEFAULT — a (type, Epic type) it lacks is inherited from DEFAULT. A TTM verdict rule
-- (code, registry.ts) names the set it reads (`policySet`); a Rule Group turns that rule ON for a range of Epics.
CREATE TABLE IF NOT EXISTS ttm_policy_sets (
    key VARCHAR(40) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ttm_policy_sets_key_check CHECK (key ~ '^[A-Za-z0-9_-]+$')
);

INSERT INTO ttm_policy_sets (key, name, note) VALUES
    ('DEFAULT', 'Mặc định', 'Tiêu chí Time to Market hiện hành — mọi bộ khác kế thừa các dòng mà nó không khai báo.'),
    ('legacy-30d', 'CNTT 30 ngày (Tính năng mới/Cải tiến L3-L4, Epic cũ)', 'Owner 2026-10-26: Epic CT-Lv34 có Start Date < 01/09/2026 hoặc R4G Date < 01/10/2026 có Target TTM-CNTT 30 ngày làm việc.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE ttm_policy_configs ADD COLUMN IF NOT EXISTS policy_set VARCHAR(40) NOT NULL DEFAULT 'DEFAULT' REFERENCES ttm_policy_sets(key);

-- One row per (set, type, Epic type): the old (type, Epic type) uniqueness only held while there was a single set.
ALTER TABLE ttm_policy_configs DROP CONSTRAINT IF EXISTS uq_ttm_policy_configs_type_complexity;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ttm_policy_configs_set_type_complexity') THEN
        ALTER TABLE ttm_policy_configs ADD CONSTRAINT uq_ttm_policy_configs_set_type_complexity UNIQUE (policy_set, ttm_type, epic_complexity_type);
    END IF;
END $$;

INSERT INTO ttm_policy_configs (policy_set, ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active)
VALUES ('legacy-30d', 'TTM_CNTT', 'CT-Lv34', 'START_DATE', 'R4G_DATE', 30, TRUE)
ON CONFLICT (policy_set, ttm_type, epic_complexity_type) DO NOTHING;
