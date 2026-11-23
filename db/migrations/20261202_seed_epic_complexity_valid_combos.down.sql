-- Reverse 20261202_seed_epic_complexity_valid_combos.sql: delete the seed rows this migration could have
-- inserted. The up migration only adds combos that did NOT already exist (ON CONFLICT DO NOTHING), and
-- the 6 combos below (TNM-Lv12 / TNM-Lv34 / HTM-Lv34 / QT-Lv34 / DV-Lv34 / GPNT-Lv34) were not present
-- before — the database only had the CT-Lv12 / CT-Lv34 / SP-Lv12 / SP-Lv34 combos. So this removes only
-- the seeded rows and leaves any admin-tuned pre-existing config (CT/SP) untouched.

DELETE FROM ttm_policy_configs
WHERE policy_set = 'DEFAULT'
  AND epic_complexity_type IN ('TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34');

DELETE FROM epic_status_alert_rules
WHERE epic_complexity_type IN ('TNM-Lv12', 'TNM-Lv34', 'HTM-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34');
