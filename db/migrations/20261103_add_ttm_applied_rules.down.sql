DELETE FROM scoring_rule_group_rules WHERE rule_id IN ('dq-r11', 'ttm-cntt-except-plan');
ALTER TABLE black_listed_epics DROP CONSTRAINT IF EXISTS black_listed_epics_source_check;
ALTER TABLE black_listed_epics DROP COLUMN IF EXISTS source;
ALTER TABLE scoring_rule_groups DROP CONSTRAINT IF EXISTS scoring_rule_groups_ttm_applied_check;
ALTER TABLE scoring_rule_groups DROP COLUMN IF EXISTS ttm_applied;
