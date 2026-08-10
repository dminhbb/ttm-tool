-- Up migration: permit additional Jira Epic statuses in alert rule configuration.
ALTER TABLE epic_status_alert_rules
    DROP CONSTRAINT IF EXISTS epic_status_alert_rules_epic_status_check;
