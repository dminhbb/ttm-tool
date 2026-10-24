-- Retire epic_alert_history (owner decision 2026-10-24, DB-size reduction): the day-by-day Fail TTM-CNTT /
-- Cảnh báo muộn rows are fully covered by epic_alert_timeline runs (same 232 Epics on the day of this
-- migration), which now also back the "Released ẩn trừ khi từng có cảnh báo" rule
-- (getEpicKeysWithCnttAlertRuns) and the "Epic History" API (listEpicCnttAlertRuns).
--
-- The one thing the history rows carried that a run lacked is the Epic's Jira status at the time, so first
-- copy it into the run's detail ('status', the newest one inside the run — what the import now writes). Keys
-- are merged in front of fromDate/targetDate to match the order recordEpicAlertTimelineTransitions compares.
-- MUST run after the code that no longer reads or writes epic_alert_history is deployed.
UPDATE epic_alert_timeline t
SET detail = jsonb_build_object('status', s.alert_status) || COALESCE(t.detail, '{}'::jsonb),
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (r.id) r.id, h.alert_status
    FROM epic_alert_timeline r
    JOIN epic_alert_history h
      ON h.epic_key = r.epic_key
     AND h.phase = 'OVERALL'
     AND h.alert_type = CASE r.alert_type WHEN 'FAIL_TTM_CNTT' THEN 'FAIL' ELSE 'LATE' END
     AND h.alert_date BETWEEN r.start_date AND COALESCE(r.end_date, r.last_seen_date)
    WHERE r.alert_type IN ('FAIL_TTM_CNTT', 'LATE_TTM_CNTT')
    ORDER BY r.id, h.alert_date DESC
) s
WHERE t.id = s.id AND NOT (COALESCE(t.detail, '{}'::jsonb) ? 'status');

DROP TABLE IF EXISTS epic_alert_history;
