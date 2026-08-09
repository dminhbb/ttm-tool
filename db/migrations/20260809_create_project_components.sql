-- Up migration: persistent Component/s catalog for imported Jira projects.
CREATE TABLE IF NOT EXISTS project_components (
    id SERIAL PRIMARY KEY,
    project_key VARCHAR(50) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_components_project_component UNIQUE (project_key, component_name)
);

CREATE INDEX IF NOT EXISTS idx_project_components_project_active
    ON project_components (project_key, is_active);

-- Backfill components that were already persisted in existing import rows.
WITH imported_components AS (
    SELECT
        NULLIF(import_rows.normalized_data_json::jsonb ->> 'projectKey', '') AS project_key,
        BTRIM(component_value) AS component_name
    FROM import_rows
    CROSS JOIN LATERAL regexp_split_to_table(
        COALESCE(
            NULLIF(import_rows.normalized_data_json::jsonb ->> 'components', ''),
            import_rows.raw_data_json::jsonb ->> 'Component/s',
            import_rows.raw_data_json::jsonb ->> 'Components',
            ''
        ),
        '\\s*[,;]\\s*'
    ) AS component_value
)
INSERT INTO project_components (project_key, component_name)
SELECT project_key, component_name
FROM imported_components
WHERE project_key IS NOT NULL AND component_name <> ''
ON CONFLICT (project_key, component_name) DO NOTHING;
