-- Down migration for 20260810_allow_custom_epic_alert_statuses.sql.
DELETE FROM epic_status_alert_rules
WHERE epic_status NOT IN ('Design', 'In Progress');

ALTER TABLE epic_status_alert_rules
    ADD CONSTRAINT epic_status_alert_rules_epic_status_check
    CHECK (epic_status IN ('Design', 'In Progress'));
