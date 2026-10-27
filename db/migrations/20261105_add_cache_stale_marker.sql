-- "Cần tạo lại cache" for changes the Scoring Service fingerprint (rulesetVersion) cannot see (owner 2026-10-27):
-- saving users, projects, Domains, Epic ngoại lệ, the TTM scope or the Rule Groups no longer rebuilds the derived
-- caches in the background. The save only marks the caches stale here; the marker clears when a rebuild that STARTED
-- after the mark finishes. Only a CSV import (manual or API) and the daily run rebuild on their own.
ALTER TABLE derived_cache_refresh_lock ADD COLUMN IF NOT EXISTS stale_since TIMESTAMP WITH TIME ZONE;
ALTER TABLE derived_cache_refresh_lock ADD COLUMN IF NOT EXISTS stale_reasons TEXT[] NOT NULL DEFAULT '{}';
