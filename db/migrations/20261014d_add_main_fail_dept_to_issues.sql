-- "Phòng chịu trách nhiệm chính" of a Fail TTM — CSV column main_fail_dept (crawl tool, owner
-- 2026-10-14). Read by the Scoring Service (REC_MISSING_RESPONSIBLE_DEPARTMENT: blank or "None" counts
-- as missing) and shown in Duyệt Epic → "Giải trình fail TTM".
ALTER TABLE issues ADD COLUMN IF NOT EXISTS main_fail_dept TEXT;
