-- Retire epic_data_anomaly_violations and epic_milestone_history (owner decision 2026-10-24, DB-size /
-- "no rarely-used tables"). MUST run after the code that no longer reads or writes them is deployed.
--
--  * epic_data_anomaly_violations: written on every import, never read (its two read functions had no
--    caller) and already out of step with what the screens show — it holds the legacy engine's R1–R7 set
--    (192 Epics) while the displayed anomalies come from the Scoring Service (85 Epics, another rule set).
--    Per-rule counts, if ever needed, come from epic_alert_row_cache.badge_codes.
--  * epic_milestone_history: 0 rows, its write path switched off long ago (phase completion is evaluated
--    live from the Story / Subtask statuses, epic-phase-completion-service.ts).
DROP TABLE IF EXISTS epic_data_anomaly_violations;
DROP TABLE IF EXISTS epic_milestone_history;
