-- Back to the 20261019b version of projects_sync_project_type (a NULL category leaves project_type_id as is).
-- The backfilled NULLs are not restored: they only removed types that no longer matched any category.
CREATE OR REPLACE FUNCTION projects_sync_project_type() RETURNS trigger AS $fn$
BEGIN
    IF NEW.project_category IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.project_type_id IS NULL
       OR TG_OP = 'UPDATE' AND NEW.project_category IS DISTINCT FROM OLD.project_category THEN
        NEW.project_type_id := (SELECT id FROM project_types WHERE legacy_category = NEW.project_category);
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;
