-- Schema-only revert (per this repo's convention): restores the CHECK constraints to the 4-way set.
-- Only safe if no rows with the new codes exist at rollback time. The issues recompute is intentionally
-- NOT reversed — it only corrected existing rows to their new codes and is idempotent going forward.
ALTER TABLE epic_status_alert_rules DROP CONSTRAINT epic_status_alert_rules_epic_complexity_type_check;
ALTER TABLE epic_status_alert_rules ADD CONSTRAINT epic_status_alert_rules_epic_complexity_type_check
  CHECK (epic_complexity_type IN (
    'SIMPLE', 'COMPLEX', 'CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34'
  ));

ALTER TABLE ttm_policy_configs DROP CONSTRAINT ttm_policy_configs_epic_complexity_type_check;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_epic_complexity_type_check
  CHECK (epic_complexity_type IN (
    'SIMPLE', 'COMPLEX', 'CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34'
  ));
