-- "Từ chối import" — persist the proof that exempts an Epic from rule B (owner request 2026-10-19).
--
-- Rule B (RELEASED_BEFORE) is skipped for an Epic the database saw in a status other than Released /
-- MVP Done on/after date B (e.g. DL-65580). That proof used to be re-read from issues /
-- issue_daily_snapshots at every import — but issues are purged with the RAW retention and snapshots
-- go with "Xóa lớp dữ liệu", so once the proof aged out the Epic was denied by rule B and its data
-- deleted. The import now records such an Epic once, as allow_import = TRUE with source AUTO_EXEMPT
-- ("Cho phép import" = exempt from the automatic rules from then on).
ALTER TABLE denied_import_epics DROP CONSTRAINT IF EXISTS denied_import_epics_source_check;
ALTER TABLE denied_import_epics ADD CONSTRAINT denied_import_epics_source_check
    CHECK (source IN ('MANUAL', 'AUTO_RULE', 'SEED', 'AUTO_EXEMPT'));
