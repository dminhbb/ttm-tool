DELETE FROM denied_import_epics WHERE source = 'AUTO_EXEMPT';
ALTER TABLE denied_import_epics DROP CONSTRAINT IF EXISTS denied_import_epics_source_check;
ALTER TABLE denied_import_epics ADD CONSTRAINT denied_import_epics_source_check
    CHECK (source IN ('MANUAL', 'AUTO_RULE', 'SEED'));
