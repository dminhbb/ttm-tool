-- PMS Project Core — clearing a project's category clears its project_type_id too (review 2026-10-20).
--
-- projects_sync_project_type (20261019b) returned early when NEW.project_category IS NULL, so setting a
-- project's "Loại hình dự án" back to "Chưa xác định" left project_type_id on the old type, and the
-- 20261019b backfill only covered non-null categories — projects and the PMS type disagreed for good.
--
-- Only a type that came FROM the category is cleared: one whose project_types.legacy_category is the
-- category being removed (UPDATE) — a type set by PMS itself (no legacy category) is left alone.

CREATE OR REPLACE FUNCTION projects_sync_project_type() RETURNS trigger AS $fn$
BEGIN
    IF NEW.project_category IS NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.project_category IS NOT NULL
           AND NEW.project_type_id IN (SELECT id FROM project_types WHERE legacy_category = OLD.project_category) THEN
            NEW.project_type_id := NULL;
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' AND NEW.project_type_id IS NULL
       OR TG_OP = 'UPDATE' AND NEW.project_category IS DISTINCT FROM OLD.project_category THEN
        NEW.project_type_id := (SELECT id FROM project_types WHERE legacy_category = NEW.project_category);
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Backfill (idempotent): a project without a category keeps no type derived from a category.
UPDATE projects p
SET project_type_id = NULL
FROM project_types t
WHERE p.project_category IS NULL
  AND p.project_type_id = t.id
  AND t.legacy_category IS NOT NULL;
