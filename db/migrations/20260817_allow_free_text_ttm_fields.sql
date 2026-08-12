-- TTM field names are configurable labels. The engine maps supported source fields
-- while retaining unknown labels for later data-source mapping.
ALTER TABLE ttm_policy_configs DROP CONSTRAINT IF EXISTS ttm_policy_configs_from_ttm_field_check;
ALTER TABLE ttm_policy_configs DROP CONSTRAINT IF EXISTS ttm_policy_configs_to_ttm_field_check;
ALTER TABLE ttm_policy_configs ALTER COLUMN from_ttm_field TYPE VARCHAR(100);
ALTER TABLE ttm_policy_configs ALTER COLUMN to_ttm_field TYPE VARCHAR(100);
