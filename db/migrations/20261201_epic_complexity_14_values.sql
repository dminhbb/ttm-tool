-- Epic "Loại Epic" expanded from 4 combinations to 8 valid + 6 "Phân loại sai Epic" (owner request
-- 2026-11-23). Request type is now 7-way (Cải tiến / Tính năng mới / Sản phẩm / Hệ thống mới /
-- Quy trình / Dịch vụ / Giải pháp nền tảng); every non-CT type only exists at Lv34, so its Lv12
-- combination is a data error (the "Phân loại sai Epic" group R6 flags). The JS source of truth is
-- computeEpicComplexity in src/lib/epic-complexity.ts; this migration only widens the two config-table
-- CHECK constraints (issues.epic_complexity_type is a plain varchar with no CHECK) and recomputes the
-- existing issues rows from request_type + requirement_level so old SP-* rows become the new codes.
--
-- The old SP-Lv12/SP-Lv34 rows in epic_status_alert_rules / ttm_policy_configs are admin-tuned config,
-- not seed data — like the 2026-09 SIMPLE/COMPLEX widening they are left in place (inert) rather than
-- destroyed; the admin reconfigures the 14 types via the "Cấu hình cảnh báo" screen.

ALTER TABLE epic_status_alert_rules DROP CONSTRAINT epic_status_alert_rules_epic_complexity_type_check;
ALTER TABLE epic_status_alert_rules ADD CONSTRAINT epic_status_alert_rules_epic_complexity_type_check
  CHECK (epic_complexity_type IN (
    'SIMPLE', 'COMPLEX',
    'CT-Lv12', 'CT-Lv34', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34',
    'TNM-Lv12', 'HTM-Lv12', 'SP-Lv12', 'QT-Lv12', 'DV-Lv12', 'GPNT-Lv12'
  ));

ALTER TABLE ttm_policy_configs DROP CONSTRAINT ttm_policy_configs_epic_complexity_type_check;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_epic_complexity_type_check
  CHECK (epic_complexity_type IN (
    'SIMPLE', 'COMPLEX',
    'CT-Lv12', 'CT-Lv34', 'TNM-Lv34', 'HTM-Lv34', 'SP-Lv34', 'QT-Lv34', 'DV-Lv34', 'GPNT-Lv34',
    'TNM-Lv12', 'HTM-Lv12', 'SP-Lv12', 'QT-Lv12', 'DV-Lv12', 'GPNT-Lv12'
  ));

-- Recompute issues.epic_complexity_type from request_type + requirement_level for every non-null row,
-- matching computeEpicComplexity (normalize = lower + trim). CT is the default for missing/unknown
-- request types; a non-CT type at Lv12 is kept (the "Phân loại sai Epic" group, so R6 can flag it).
UPDATE issues
SET epic_complexity_type =
      CASE
        WHEN (lower(trim(request_type)) IN ('', 'none') OR lower(trim(request_type)) IS NULL) THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'CT-Lv34' ELSE 'CT-Lv12' END
        WHEN lower(trim(request_type)) = 'cải tiến' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'CT-Lv34' ELSE 'CT-Lv12' END
        WHEN lower(trim(request_type)) = 'tính năng mới' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'TNM-Lv34' ELSE 'TNM-Lv12' END
        WHEN lower(trim(request_type)) = 'sản phẩm' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'SP-Lv34' ELSE 'SP-Lv12' END
        WHEN lower(trim(request_type)) = 'hệ thống mới' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'HTM-Lv34' ELSE 'HTM-Lv12' END
        WHEN lower(trim(request_type)) = 'quy trình' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'QT-Lv34' ELSE 'QT-Lv12' END
        WHEN lower(trim(request_type)) = 'dịch vụ' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'DV-Lv34' ELSE 'DV-Lv12' END
        WHEN lower(trim(request_type)) = 'giải pháp nền tảng' THEN
          CASE WHEN (requirement_level IN ('3', '4')) THEN 'GPNT-Lv34' ELSE 'GPNT-Lv12' END
        ELSE 'CT-Lv12'
      END
WHERE epic_complexity_type IS NOT NULL;
