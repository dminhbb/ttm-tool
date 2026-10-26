DELETE FROM ttm_policy_configs WHERE policy_set <> 'DEFAULT';
ALTER TABLE ttm_policy_configs DROP CONSTRAINT IF EXISTS uq_ttm_policy_configs_set_type_complexity;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT uq_ttm_policy_configs_type_complexity UNIQUE (ttm_type, epic_complexity_type);
ALTER TABLE ttm_policy_configs DROP COLUMN IF EXISTS policy_set;
DROP TABLE IF EXISTS ttm_policy_sets;
