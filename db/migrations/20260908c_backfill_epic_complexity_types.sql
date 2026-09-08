-- One-time data backfill: reclassify already-imported Epics' issues.epic_complexity_type from the
-- old SIMPLE/COMPLEX scheme to the new 4-way CT-Lv12/CT-Lv34/SP-Lv12/SP-Lv34 scheme (see
-- 20260908b_widen_epic_complexity_types.sql). Only NEW imports go through computeEpicComplexity
-- (import-service.ts) — issues rows already on disk before that change keeps their stale SIMPLE/
-- COMPLEX value forever unless corrected here.
--
-- The raw request-type text isn't its own issues column, but survives per issue per batch in
-- import_rows.normalized_data_json ->> 'epicType' (the raw import row, written once at import time
-- and never touched again — see import-service.ts's raw-row insert and epic-alert-service.ts's own
-- use of this same join for a different purpose). issues and import_rows both cascade-delete from
-- the same import_batches row, so any issues row that still exists still has its raw sibling too —
-- no re-import needed. issues.requirement_level is already raw text, reused as-is.
--
-- Mirrors computeEpicComplexity's exact rule and its CT-Lv12 default for anything unmatched/missing.
-- Only touches rows still on the retired scheme (or NULL) — safe to run again with no effect on
-- rows already reclassified.
UPDATE issues i
SET epic_complexity_type = CASE
  WHEN raw.request_type IN ('sản phẩm/dịch vụ/quy trình mới', 'sản phẩm') AND raw.request_level IN ('3', '4') THEN 'SP-Lv34'
  WHEN raw.request_type IN ('sản phẩm/dịch vụ/quy trình mới', 'sản phẩm') AND raw.request_level IN ('1', '2') THEN 'SP-Lv12'
  WHEN raw.request_type IN ('cải tiến', 'tính năng mới') AND raw.request_level IN ('3', '4') THEN 'CT-Lv34'
  ELSE 'CT-Lv12'
END,
updated_at = CURRENT_TIMESTAMP
FROM (
  SELECT
    i2.issue_key,
    i2.source_import_batch_id,
    lower(trim(COALESCE(ir.normalized_data_json::jsonb ->> 'epicType', ''))) AS request_type,
    lower(trim(COALESCE(i2.requirement_level, ''))) AS request_level
  FROM issues i2
  LEFT JOIN import_rows ir
    ON ir.import_batch_id = i2.source_import_batch_id
    AND ir.normalized_data_json::jsonb ->> 'issueKey' = i2.issue_key
  WHERE UPPER(i2.issue_type) IN ('EPIC', 'CTNB')
) raw
WHERE raw.issue_key = i.issue_key
  AND raw.source_import_batch_id = i.source_import_batch_id
  AND UPPER(i.issue_type) IN ('EPIC', 'CTNB')
  AND (i.epic_complexity_type IN ('SIMPLE', 'COMPLEX') OR i.epic_complexity_type IS NULL);
