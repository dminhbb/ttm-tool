-- "Quyền xem" (owner 2026-11-01): extra Epics a USER / ADMIN may SEE in Quản trị Epic, beyond their real data scope.
-- View only: such Epics are listed with an eye icon and are never counted in any metric (widgets, TTM indexes,
-- dashboards, reports). Not applied to SUPERADMIN / SUPERVISOR, who already see everything.
--   user_view_projects            projects granted for viewing (no component row = every Epic of the project)
--   user_view_project_components  narrowing of a granted project to some components
--   user_view_epics               Epics granted one by one (always shown — the date limits do not apply to them)
--   user_view_settings            "Giới hạn thời gian" for the project grants: Created date > created_after and
--                                 Start Date > start_after (NULL = no limit; an Epic without Start Date fails start_after)
CREATE TABLE IF NOT EXISTS user_view_projects (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS user_view_project_components (
  user_id        INTEGER NOT NULL,
  project_id     INTEGER NOT NULL,
  component_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, project_id, component_name),
  CONSTRAINT user_view_project_components_project_fkey FOREIGN KEY (user_id, project_id)
    REFERENCES user_view_projects (user_id, project_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_view_epics (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  epic_key VARCHAR(100) NOT NULL,
  PRIMARY KEY (user_id, epic_key)
);

CREATE TABLE IF NOT EXISTS user_view_settings (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_after      DATE,
  start_after        DATE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
