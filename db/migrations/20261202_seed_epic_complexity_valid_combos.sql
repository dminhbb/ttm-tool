-- Seed the full set of valid "Phân loại Epic" combinations into the two config tables of the "Cấu
-- hình cảnh báo" screen, so a fresh or existing database starts with every valid combo present and the
-- admin can tune each one. Owner decision 2026-11-23: Tính năng mới Level 1-2 (TNM-Lv12) is now VALID,
-- so the valid set is 9 combinations:
--
--   CT-Lv12, CT-Lv34, TNM-Lv12, TNM-Lv34, HTM-Lv34, SP-Lv34, QT-Lv34, DV-Lv34, GPNT-Lv34
--
-- The JS source of truth is computeEpicComplexity / VALID_EPIC_COMPLEXITIES_LIST in
-- src/lib/epic-complexity.ts. The 20261201 migration already widened the CHECK constraints to accept
-- all 14 codes (including TNM-Lv12), so inserting these rows is unblocked. Default values for the
-- newly-added combos are copied from the SP group (owner decision): the level-34-only types use
-- SP-Lv34's budget, and TNM-Lv12 uses SP-Lv12's budget. ON CONFLICT ... DO NOTHING keeps any row the
-- admin has already tuned (seeding never overwrites existing config).
--
-- ttm_policy_configs  — 9 combos × {TTM_CNTT, TTM_E2E} × policy_set 'DEFAULT'  = 18 rows.
-- epic_status_alert_rules — 9 combos × {Design, In Progress} = 18 rows.

INSERT INTO ttm_policy_configs (ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active, policy_set)
SELECT * FROM (VALUES
  -- TTM_CNTT (START_DATE → R4G_DATE)
  ('TTM_CNTT'::varchar(20), 'TNM-Lv12'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 15::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_CNTT'::varchar(20), 'TNM-Lv34'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 30::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_CNTT'::varchar(20), 'HTM-Lv34'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 30::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_CNTT'::varchar(20), 'QT-Lv34'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 30::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_CNTT'::varchar(20), 'DV-Lv34'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 30::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_CNTT'::varchar(20), 'GPNT-Lv34'::varchar(20), 'START_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 30::integer, TRUE, 'DEFAULT'::varchar(40)),
  -- TTM_E2E (IDEA_APPROVED_DATE → R4G_DATE)
  ('TTM_E2E'::varchar(20), 'TNM-Lv12'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_E2E'::varchar(20), 'TNM-Lv34'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_E2E'::varchar(20), 'HTM-Lv34'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_E2E'::varchar(20), 'QT-Lv34'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_E2E'::varchar(20), 'DV-Lv34'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40)),
  ('TTM_E2E'::varchar(20), 'GPNT-Lv34'::varchar(20), 'IDEA_APPROVED_DATE'::varchar(100), 'R4G_DATE'::varchar(100), 50::integer, TRUE, 'DEFAULT'::varchar(40))
) AS seed (ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active, policy_set)
ON CONFLICT (policy_set, ttm_type, epic_complexity_type) DO NOTHING;

INSERT INTO epic_status_alert_rules (epic_complexity_type, epic_status, early_alert_offset_days, late_alert_offset_days, late_alert_percent, is_active)
SELECT * FROM (VALUES
  -- TNM-Lv12 (copy SP-Lv12).
  ('TNM-Lv12'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('TNM-Lv12'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE),
  -- TNM-Lv34 & the level-34-only types (copy SP-Lv34).
  ('TNM-Lv34'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('TNM-Lv34'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE),
  ('HTM-Lv34'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('HTM-Lv34'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE),
  ('QT-Lv34'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('QT-Lv34'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE),
  ('DV-Lv34'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('DV-Lv34'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE),
  ('GPNT-Lv34'::varchar(20), 'Design'::varchar(50), 5::integer, 7::integer, 23.3333::numeric(7,4), TRUE),
  ('GPNT-Lv34'::varchar(20), 'In Progress'::varchar(50), 28::integer, 26::integer, 85::numeric(7,4), TRUE)
) AS seed (epic_complexity_type, epic_status, early_alert_offset_days, late_alert_offset_days, late_alert_percent, is_active)
ON CONFLICT (epic_complexity_type, epic_status) DO NOTHING;
