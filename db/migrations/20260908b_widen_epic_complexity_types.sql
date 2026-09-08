-- New company rule: an Epic's "complexity type" is now one of 4 values (CT-Lv12/CT-Lv34/SP-Lv12/
-- SP-Lv34, computed from epic_request_type + epic_request_level at import time — see
-- computeEpicComplexity in import-service.ts) instead of the old 2-way SIMPLE/COMPLEX.
--
-- Widens (does not replace) both CHECK constraints so the new values are accepted alongside the
-- old ones. Existing SIMPLE/COMPLEX rows in epic_status_alert_rules/ttm_policy_configs are left in
-- place deliberately — they're real admin-tuned configuration, not seed data, and no Epic will ever
-- be classified SIMPLE/COMPLEX again after this change, so they simply go inert rather than being
-- destroyed. The admin reconfigures alert rules/TTM policies for the 4 new types via the existing
-- "Cấu hình cảnh báo" screen, and can delete the old SIMPLE/COMPLEX rows there whenever ready.
ALTER TABLE epic_status_alert_rules DROP CONSTRAINT epic_status_alert_rules_epic_complexity_type_check;
ALTER TABLE epic_status_alert_rules ADD CONSTRAINT epic_status_alert_rules_epic_complexity_type_check
  CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX', 'CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34'));

ALTER TABLE ttm_policy_configs DROP CONSTRAINT ttm_policy_configs_epic_complexity_type_check;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_epic_complexity_type_check
  CHECK (epic_complexity_type IN ('SIMPLE', 'COMPLEX', 'CT-Lv12', 'CT-Lv34', 'SP-Lv12', 'SP-Lv34'));
