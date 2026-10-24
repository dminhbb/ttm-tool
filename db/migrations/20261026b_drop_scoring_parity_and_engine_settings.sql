-- Retire the legacy alert engine's scaffolding (owner decision 2026-10-24: the Epic Scoring Service has run
-- the screens since 2026-09-30, no more comparison is wanted). MUST run after the code that no longer reads
-- or writes these tables is deployed.
--
--  * scoring_parity_runs: one row per cache rebuild / manual run comparing the Scoring Service with the
--    legacy engine — the "Đối chiếu Scoring Service" panel is gone.
--  * scoring_engine_settings: the 'legacy' | 'scoring' display switch — there is only the Scoring Service now.
-- epic_alert_row_cache (and the other derived caches) are untouched.
DROP TABLE IF EXISTS scoring_parity_runs;
DROP TABLE IF EXISTS scoring_engine_settings;
