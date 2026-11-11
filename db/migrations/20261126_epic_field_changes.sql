-- "Chuẩn hoá dữ liệu" — section "Epic thay đổi dữ liệu" (owner 2026-11-11): every change of an Epic's Start date,
-- R4G Date, Requirement Level or "Loại yêu cầu" (request_type) between two of its consecutive versions in `issues`,
-- limited to "có → trống" and "có → giá trị khác" (a first fill "trống → có" is not a change). Derived cache: rebuilt in
-- full with the other derived caches (refreshDerivedCaches → epic-field-change-service.ts) after an import, the daily run
-- and a manual rebuild; the screen only reads it. Beyond the dense 30 import days only the weekly snapshot versions are
-- kept (data-layer-retention), so a change undone between two snapshots is not seen.
CREATE TABLE IF NOT EXISTS epic_field_changes (
    epic_key VARCHAR(50) NOT NULL,
    -- aggregated_at of the version that carries the new value (its data layer).
    layer_at TIMESTAMPTZ NOT NULL,
    -- START_DATE | R4G_DATE | REQUIREMENT_LEVEL | REQUEST_TYPE
    field VARCHAR(30) NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT,
    -- jira_created_at::date of the Epic's newest version — what the screen's "created date" filter compares.
    epic_created_date DATE,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT epic_field_changes_pkey PRIMARY KEY (epic_key, layer_at, field)
);
CREATE INDEX IF NOT EXISTS idx_epic_field_changes_created ON epic_field_changes (epic_created_date);
