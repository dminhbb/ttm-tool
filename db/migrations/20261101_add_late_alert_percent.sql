-- "Cảnh báo muộn" theo % ngân sách (spec 2026-10-25 §17.6, owner 2026-10-26).
--
-- The late-alert date of an Epic was Start Date +wd late_alert_offset_days, a fixed number per (Epic type, status) — so a
-- budget set with another N (bộ ngân sách "legacy-30d": 30 instead of 25) kept the old day count. Now the rule stores
-- late_alert_percent = % of the Epic's TTM-CNTT budget N; the date is Start Date +wd ceil(percent × N). The existing days
-- are converted to percent of the DEFAULT set's budget, so every Epic keeps today's alert date (checked: 0 differences).
-- late_alert_offset_days stays as the "≈ days at the DEFAULT budget" the screen last saved (informational).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'epic_status_alert_rules' AND column_name = 'late_alert_percent'
    ) THEN
        ALTER TABLE epic_status_alert_rules ADD COLUMN late_alert_percent NUMERIC(7,4) NOT NULL DEFAULT 100;
        ALTER TABLE epic_status_alert_rules ADD CONSTRAINT epic_status_alert_rules_late_alert_percent_check
            CHECK (late_alert_percent >= 0 AND late_alert_percent <= 1000);

        UPDATE epic_status_alert_rules r
        SET late_alert_percent = ROUND(r.late_alert_offset_days::numeric * 100 / p.working_days, 4)
        FROM ttm_policy_configs p
        WHERE p.policy_set = 'DEFAULT' AND p.ttm_type = 'TTM_CNTT' AND p.is_active
          AND p.epic_complexity_type = r.epic_complexity_type AND p.working_days > 0;
    END IF;
END $$;
