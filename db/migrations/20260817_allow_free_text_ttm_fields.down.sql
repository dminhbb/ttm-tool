ALTER TABLE ttm_policy_configs ALTER COLUMN from_ttm_field TYPE VARCHAR(40);
ALTER TABLE ttm_policy_configs ALTER COLUMN to_ttm_field TYPE VARCHAR(40);
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_from_ttm_field_check CHECK (from_ttm_field IN ('IDEA_APPROVED_DATE', 'START_DATE'));
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_to_ttm_field_check CHECK (to_ttm_field IN ('R4G_DATE', 'DUE_DATE'));
