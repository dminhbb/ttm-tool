-- Back to "a row = selected": the OFF rows (which only exist for the layered model) are dropped with the column.
DELETE FROM scoring_rule_group_rules WHERE state = 'OFF';
ALTER TABLE scoring_rule_group_rules DROP CONSTRAINT IF EXISTS scoring_rule_group_rules_state_check;
ALTER TABLE scoring_rule_group_rules DROP COLUMN IF EXISTS state;
