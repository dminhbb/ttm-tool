-- PMS Project Core — keep the PMS tables in step with what TTM still writes (owner request 2026-10-19).
--
-- 20261009a–e backfilled project_external_bindings, ttm_project_configs, project_members and
-- projects.project_type_id ONCE. TTM keeps writing projects / user_projects only (master-data-service.ts,
-- api/projects bulk import, auth-service.ts replacePermissions), so every project created, every
-- "Time to Market" / category / Jira key change and every PM/SM change after the migration drifted
-- away from the PMS tables. Still expand-only: TTM reads nothing new, the triggers below only mirror
-- its writes. Source of truth stays projects + user_projects until PMS takes those writes over.
--
-- Not mirrored on purpose: a backup restore (db-backup-service.ts importSqlFile) runs with
-- ALTER TABLE … DISABLE TRIGGER ALL, so these triggers don't fire — re-run the backfill block at the
-- end of this file after a restore if the PMS tables matter by then.

-- 1. projects.project_type_id follows project_category (BEFORE, so the row is written once).
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

DROP TRIGGER IF EXISTS trg_projects_sync_project_type ON projects;
CREATE TRIGGER trg_projects_sync_project_type
    BEFORE INSERT OR UPDATE OF project_category ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_sync_project_type();

-- 2. ttm_project_configs.is_enabled follows projects.ttm; a new project gets its row and its JIRA binding;
--    a changed Jira key closes the old binding and opens a new primary one (history kept, valid_to/valid_from).
CREATE OR REPLACE FUNCTION projects_sync_pms_tables() RETURNS trigger AS $fn$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.ttm IS DISTINCT FROM OLD.ttm THEN
        INSERT INTO ttm_project_configs (project_id, is_enabled)
        VALUES (NEW.id, NEW.ttm = 'Y')
        ON CONFLICT (project_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = CURRENT_TIMESTAMP;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.source_project_key IS DISTINCT FROM OLD.source_project_key THEN
        UPDATE project_external_bindings
        SET is_active = FALSE, valid_to = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = NEW.id AND system_code = 'JIRA' AND is_active
          AND UPPER(external_project_key) = UPPER(OLD.source_project_key);
    END IF;

    IF TG_OP = 'INSERT' OR NEW.source_project_key IS DISTINCT FROM OLD.source_project_key THEN
        INSERT INTO project_external_bindings (project_id, system_code, external_project_key, is_primary, is_active, valid_from)
        SELECT NEW.id, 'JIRA', NEW.source_project_key, TRUE, TRUE, CASE WHEN TG_OP = 'UPDATE' THEN CURRENT_DATE END
        WHERE NOT EXISTS (
            SELECT 1 FROM project_external_bindings b
            WHERE b.project_id = NEW.id AND b.system_code = 'JIRA' AND b.is_active
              AND UPPER(b.external_project_key) = UPPER(NEW.source_project_key)
        );
    END IF;
    RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_sync_pms_tables ON projects;
CREATE TRIGGER trg_projects_sync_pms_tables
    AFTER INSERT OR UPDATE OF ttm, source_project_key ON projects
    FOR EACH ROW EXECUTE FUNCTION projects_sync_pms_tables();

-- 3. project_members (role PM_SM) follows user_projects. replacePermissions deletes a user's rows and
--    re-inserts them in the same transaction, so a PM_SM row closed TODAY is re-opened rather than
--    duplicated — re-saving a user leaves no trace in project_members.
CREATE OR REPLACE FUNCTION user_projects_sync_project_members() RETURNS trigger AS $fn$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE project_members
        SET is_active = FALSE, left_at = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = OLD.project_id AND user_id = OLD.user_id AND role_in_project = 'PM_SM' AND is_active;
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM project_members
        WHERE project_id = NEW.project_id AND user_id = NEW.user_id AND role_in_project = 'PM_SM' AND is_active
    ) THEN
        RETURN NULL;
    END IF;

    UPDATE project_members
    SET is_active = TRUE, left_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = (
        SELECT id FROM project_members
        WHERE project_id = NEW.project_id AND user_id = NEW.user_id AND role_in_project = 'PM_SM'
          AND NOT is_active AND left_at = CURRENT_DATE
        ORDER BY updated_at DESC
        LIMIT 1
    );
    IF NOT FOUND THEN
        INSERT INTO project_members (project_id, user_id, role_in_project, joined_at)
        VALUES (NEW.project_id, NEW.user_id, 'PM_SM', CURRENT_DATE);
    END IF;
    RETURN NULL;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_projects_sync_project_members ON user_projects;
CREATE TRIGGER trg_user_projects_sync_project_members
    AFTER INSERT OR DELETE ON user_projects
    FOR EACH ROW EXECUTE FUNCTION user_projects_sync_project_members();

-- 4. Re-backfill what drifted since 20261009a–e (idempotent — safe to re-run, e.g. after a restore).
UPDATE projects p
SET project_type_id = t.id
FROM project_types t
WHERE p.project_category IS NOT NULL
  AND t.legacy_category = p.project_category
  AND p.project_type_id IS DISTINCT FROM t.id;

INSERT INTO ttm_project_configs (project_id, is_enabled)
SELECT p.id, p.ttm = 'Y' FROM projects p
ON CONFLICT (project_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = CURRENT_TIMESTAMP
WHERE ttm_project_configs.is_enabled IS DISTINCT FROM EXCLUDED.is_enabled;

INSERT INTO project_external_bindings (project_id, system_code, external_project_key, is_primary, is_active)
SELECT p.id, 'JIRA', p.source_project_key, TRUE, TRUE
FROM projects p
WHERE NOT EXISTS (
    SELECT 1 FROM project_external_bindings b
    WHERE b.project_id = p.id AND b.system_code = 'JIRA' AND b.is_active
      AND UPPER(b.external_project_key) = UPPER(p.source_project_key)
);

INSERT INTO project_members (project_id, user_id, role_in_project, joined_at)
SELECT up.project_id, up.user_id, 'PM_SM', CURRENT_DATE
FROM user_projects up
WHERE NOT EXISTS (
    SELECT 1 FROM project_members m
    WHERE m.project_id = up.project_id AND m.user_id = up.user_id AND m.role_in_project = 'PM_SM' AND m.is_active
);

UPDATE project_members m
SET is_active = FALSE, left_at = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
WHERE m.role_in_project = 'PM_SM' AND m.is_active
  AND NOT EXISTS (SELECT 1 FROM user_projects up WHERE up.project_id = m.project_id AND up.user_id = m.user_id);
