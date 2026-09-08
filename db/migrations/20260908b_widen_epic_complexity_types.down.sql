-- Only safe if no CT-Lv12/CT-Lv34/SP-Lv12/SP-Lv34 rows exist at rollback time (schema-only revert,
-- per this repo's convention — see other .down.sql files).
ALTER TABLE epic_status_alert_rules DROP CONSTRAINT epic_status_alert_rules_epic_complexity_type_check;
ALTER TABLE epic_status_alert_rules ADD CONSTRAINT epic_status_alert_rules_epic_complexity_type_check
  CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX'));

ALTER TABLE ttm_policy_configs DROP CONSTRAINT ttm_policy_configs_epic_complexity_type_check;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_epic_complexity_type_check
  CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX'));
