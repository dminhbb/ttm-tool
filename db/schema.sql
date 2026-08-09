-- Database schema for TTM Monitor

-- Drop tables if exist
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS import_rows CASCADE;
DROP TABLE IF EXISTS import_batches CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS project_components CASCADE;
DROP TABLE IF EXISTS domains CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;

-- 1. Import Batches table
CREATE TABLE import_batches (
    id SERIAL PRIMARY KEY,
    source_type VARCHAR(50) DEFAULT 'CSV',
    file_name VARCHAR(255) NOT NULL,
    import_type VARCHAR(50) DEFAULT 'MANUAL', -- MANUAL, AUTO
    imported_by VARCHAR(100) DEFAULT 'System',
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    aggregated_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Representation of the data snapshot layer
    total_rows INT DEFAULT 0,
    success_rows INT DEFAULT 0,
    warning_rows INT DEFAULT 0,
    error_rows INT DEFAULT 0,
    status VARCHAR(50) NOT NULL, -- SUCCESS, FAILED, COMPLETED_WITH_WARNINGS
    metadata_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Import Rows table (Raw staging and validation error logs)
CREATE TABLE import_rows (
    id SERIAL PRIMARY KEY,
    import_batch_id INT REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    raw_data_json TEXT NOT NULL,
    normalized_data_json TEXT,
    validation_status VARCHAR(50) NOT NULL, -- VALID, INVALID, WARNING
    validation_errors_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Issues table (Canonical issues data)
CREATE TABLE issues (
    id SERIAL PRIMARY KEY,
    source_system VARCHAR(50) DEFAULT 'JIRA',
    jira_id BIGINT NOT NULL, -- Original JIRA Issue ID
    issue_key VARCHAR(50) NOT NULL,
    issue_name TEXT NOT NULL,
    issue_type VARCHAR(50) NOT NULL, -- EPIC, STORY, TASK, BUG, SUBTASK
    current_status VARCHAR(50) NOT NULL,
    standard_status VARCHAR(50),
    ttm_stage VARCHAR(50),
    assignee_name VARCHAR(100),
    epic_key VARCHAR(50),
    parent_key VARCHAR(50),
    parent_id INT REFERENCES issues(id) ON DELETE SET NULL,
    epic_id INT REFERENCES issues(id) ON DELETE SET NULL,
    
    -- Date markers
    idea_approved_date DATE, -- T0 (E2E start)
    start_date DATE,         -- T1 (CNTT start)
    r4g_date DATE,           -- CNTT end
    due_date DATE,           -- E2E end
    target_r4g_date DATE,
    target_due_date DATE,
    
    -- KPI / Alert rules
    epic_complexity_type VARCHAR(50), -- SIMPLE, COMPLEX
    
    -- Metadata
    source_import_batch_id INT REFERENCES import_batches(id) ON DELETE CASCADE,
    aggregated_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Data layer marker
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
-- Ensure each issue key is unique within a single import batch
CREATE UNIQUE INDEX idx_issues_key_batch ON issues (issue_key, source_import_batch_id);

-- Speed up hierarchical relationships queries
CREATE INDEX idx_issues_epic_id ON issues (epic_id) WHERE epic_id IS NOT NULL;
CREATE INDEX idx_issues_parent_id ON issues (parent_id) WHERE parent_id IS NOT NULL;

-- Speed up dashboard filtering by batch or time layer
CREATE INDEX idx_issues_batch_id ON issues (source_import_batch_id);
CREATE INDEX idx_issues_aggregated_at ON issues (aggregated_at);
CREATE INDEX idx_issues_type_status ON issues (issue_type, current_status);

-- 4. Domains (master data — BRD 06 §2)
CREATE TABLE domains (
    id SERIAL PRIMARY KEY,
    domain_code VARCHAR(50) NOT NULL UNIQUE,
    domain_name VARCHAR(255) NOT NULL,
    description TEXT,
    lead_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Projects (master data — BRD 06 §3), mapped to a Domain
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    project_key VARCHAR(50) NOT NULL UNIQUE,
    project_name VARCHAR(255) NOT NULL,
    domain_id INT REFERENCES domains(id) ON DELETE SET NULL,
    source_project_key VARCHAR(50) NOT NULL, -- Jira Project Key used to match imported issues
    source_type VARCHAR(50) NOT NULL DEFAULT 'JIRA',
    lead_name VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_projects_source_key ON projects (source_project_key);

-- 6. Project components accumulated from imported Jira data.
CREATE TABLE project_components (
    id SERIAL PRIMARY KEY,
    project_key VARCHAR(50) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_components_project_component UNIQUE (project_key, component_name)
);

CREATE INDEX idx_project_components_project_active ON project_components (project_key, is_active);

-- 6. Holidays (master data — BRD 06 §4), used to compute working days
CREATE TABLE holidays (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    holiday_type VARCHAR(50) NOT NULL DEFAULT 'COMPANY',
    is_multi_day BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_holiday_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_holidays_range ON holidays (start_date, end_date) WHERE is_active;
