DROP TABLE IF EXISTS ttm_policy_configs;

ALTER TABLE epic_status_alert_rules ADD COLUMN IF NOT EXISTS fail_offset_days INT;
UPDATE epic_status_alert_rules
SET fail_offset_days = CASE epic_complexity_type WHEN 'SIMPLE' THEN 15 ELSE 30 END
WHERE fail_offset_days IS NULL;
ALTER TABLE epic_status_alert_rules ALTER COLUMN fail_offset_days SET NOT NULL;
ALTER TABLE epic_status_alert_rules ADD CONSTRAINT chk_epic_status_alert_rules_offsets
    CHECK (early_alert_offset_days < late_alert_offset_days AND late_alert_offset_days < fail_offset_days);
