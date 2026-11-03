-- "So với <ngày>" ticker (owner 2026-11-03): the Epics that are Fail TTM-CNTT (Phạm vi của QLDA) on the newest layer but
-- were not on the compared one — the list the brown "Fail TTM-CNTT tăng" sentence opens in Quản trị Epic.
ALTER TABLE ttm_dashboard_trend_cache ADD COLUMN IF NOT EXISTS new_fail_epic_keys TEXT[] NOT NULL DEFAULT '{}';
