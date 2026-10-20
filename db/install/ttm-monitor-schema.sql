-- =============================================================================================
-- TTM Monitor — tạo CSDL mới (chỉ cấu trúc, KHÔNG có dữ liệu nghiệp vụ)
-- Sinh tự động bởi scripts/db-schema-export.js từ Supabase (PostgreSQL 17.6) lúc 2026-10-20T01:59:31.216Z.
-- KHÔNG sửa tay: đổi schema bằng một file mới trong db/migrations/ rồi chạy lại script.
--
-- Gồm: 60 bảng, 65 index phụ, 4 hàm, 4 trigger.
-- Yêu cầu: PostgreSQL 14 trở lên, một database RỖNG (không dùng cho DB đã có bảng — sẽ báo lỗi và không
-- tạo gì vì cả file chạy trong một transaction). Không cần extension nào.
--
-- Cách chạy:  psql "postgres://USER:PASS@HOST:5432/ttm_tool" -v ON_ERROR_STOP=1 -f ttm-monitor-schema.sql
--             (hoặc mở file trong pgAdmin / DBeaver và chạy toàn bộ).
--
-- Cuối file ghi sẵn tên các migration đã gộp vào cấu trúc này vào bảng schema_migrations — đó là sổ
-- theo dõi, không phải dữ liệu nghiệp vụ: nhờ vậy `node scripts/migrate-db.js --target=local` trên DB mới
-- chỉ chạy những migration phát sinh SAU thời điểm sinh file. Dữ liệu danh mục / tài khoản đầu tiên:
-- xem db/install/README.md.
-- =============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Bảng (cột, khoá chính, UNIQUE, CHECK)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE ad_popup_impressions (
    popup_id integer NOT NULL,
    user_id integer NOT NULL,
    shown_count integer DEFAULT 0 NOT NULL,
    last_shown_at timestamp with time zone,
    CONSTRAINT ad_popup_impressions_pkey PRIMARY KEY (popup_id, user_id)
);

CREATE TABLE ad_popups (
    id SERIAL,
    campaign_name character varying(200) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    max_impressions integer DEFAULT 2 NOT NULL,
    message text NOT NULL,
    image_url character varying(500),
    click_url character varying(500),
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    timeout_seconds integer DEFAULT 15 NOT NULL,
    force_view boolean DEFAULT false NOT NULL,
    width_percent integer,
    height_percent integer,
    CONSTRAINT ad_popups_pkey PRIMARY KEY (id),
    CONSTRAINT ad_popups_height_percent_check CHECK (((height_percent IS NULL) OR ((height_percent >= 1) AND (height_percent <= 100)))),
    CONSTRAINT ad_popups_max_impressions_check CHECK ((max_impressions > 0)),
    CONSTRAINT ad_popups_timeout_seconds_check CHECK ((timeout_seconds > 0)),
    CONSTRAINT ad_popups_width_percent_check CHECK (((width_percent IS NULL) OR ((width_percent >= 1) AND (width_percent <= 100)))),
    CONSTRAINT chk_ad_popups_date_range CHECK ((end_date >= start_date))
);

CREATE TABLE api_keys (
    id SERIAL,
    key_name character varying(255) NOT NULL,
    app_name character varying(255) NOT NULL,
    api_key character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_unlimited boolean DEFAULT true NOT NULL,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT api_keys_pkey PRIMARY KEY (id),
    CONSTRAINT api_keys_api_key_key UNIQUE (api_key),
    CONSTRAINT chk_api_keys_validity CHECK (((is_unlimited = true) OR ((valid_from IS NOT NULL) AND ((valid_to IS NULL) OR (valid_to >= valid_from)))))
);

CREATE TABLE audit_logs (
    id SERIAL,
    user_id integer,
    action character varying(100) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE auth_sessions (
    token_hash character(64) NOT NULL,
    user_id integer NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_sessions_pkey PRIMARY KEY (token_hash)
);

CREATE TABLE black_listed_epics (
    epic_key character varying(100) NOT NULL,
    project_key character varying(50) NOT NULL,
    ttm_black_listed boolean DEFAULT true NOT NULL,
    updated_by_user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT black_listed_epics_pkey PRIMARY KEY (epic_key)
);

CREATE TABLE daily_cache_runs (
    run_date date NOT NULL,
    status text NOT NULL,
    triggered_by_user_id integer,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    finished_at timestamp with time zone,
    duration_ms integer,
    epic_row_count integer,
    source_import_batch_id integer,
    attempt_count integer DEFAULT 1 NOT NULL,
    error_message text,
    CONSTRAINT daily_cache_runs_pkey PRIMARY KEY (run_date),
    CONSTRAINT daily_cache_runs_status_check CHECK ((status = ANY (ARRAY['RUNNING'::text, 'SUCCESS'::text, 'FAILED'::text])))
);

CREATE TABLE dashboard_view_settings (
    id smallint DEFAULT 1 NOT NULL,
    lead_view_for_all_users boolean DEFAULT true NOT NULL,
    updated_by_user_id integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT dashboard_view_settings_pkey PRIMARY KEY (id),
    CONSTRAINT dashboard_view_settings_id_check CHECK ((id = 1))
);

CREATE TABLE data_retention_configs (
    id smallint NOT NULL,
    raw_import_retention_days integer DEFAULT 30 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT data_retention_configs_pkey PRIMARY KEY (id),
    CONSTRAINT data_retention_configs_id_check CHECK ((id = 1)),
    CONSTRAINT data_retention_configs_raw_import_retention_days_check CHECK (((raw_import_retention_days >= 7) AND (raw_import_retention_days <= 3650)))
);

CREATE TABLE denied_import_epics (
    epic_key character varying(100) NOT NULL,
    project_key character varying(50),
    summary text,
    status character varying(100),
    requesting_unit character varying(255),
    created_date date,
    idea_approved_date date,
    start_date date,
    r4g_date date,
    due_date date,
    allow_import boolean DEFAULT false NOT NULL,
    source character varying(20) DEFAULT 'MANUAL'::character varying NOT NULL,
    reason text,
    added_by_user_id integer,
    last_deleted_at timestamp with time zone,
    last_deleted_issue_count integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT denied_import_epics_pkey PRIMARY KEY (epic_key),
    CONSTRAINT denied_import_epics_source_check CHECK (((source)::text = ANY ((ARRAY['MANUAL'::character varying, 'AUTO_RULE'::character varying, 'SEED'::character varying, 'AUTO_EXEMPT'::character varying])::text[])))
);

CREATE TABLE derived_cache_refresh_lock (
    id smallint DEFAULT 1 NOT NULL,
    request_seq bigint DEFAULT 0 NOT NULL,
    lease_owner character varying(64),
    lease_until timestamp with time zone,
    last_source character varying(100),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT derived_cache_refresh_lock_pkey PRIMARY KEY (id),
    CONSTRAINT derived_cache_refresh_lock_id_check CHECK ((id = 1))
);

CREATE TABLE domains (
    id SERIAL,
    domain_code character varying(50) NOT NULL,
    domain_name character varying(255) NOT NULL,
    description text,
    lead_name character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT domains_pkey PRIMARY KEY (id),
    CONSTRAINT domains_domain_code_key UNIQUE (domain_code)
);

CREATE TABLE epic_alert_history (
    id SERIAL,
    epic_key character varying(50) NOT NULL,
    alert_type character varying(10) NOT NULL,
    alert_status character varying(50) NOT NULL,
    alert_date date NOT NULL,
    source_import_batch_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    phase character varying(20) DEFAULT 'OVERALL'::character varying NOT NULL,
    CONSTRAINT epic_alert_history_pkey PRIMARY KEY (id),
    CONSTRAINT epic_alert_history_epic_key_alert_date_alert_type_phase_key UNIQUE (epic_key, alert_date, alert_type, phase),
    CONSTRAINT epic_alert_history_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['LATE'::character varying, 'FAIL'::character varying])::text[]))),
    CONSTRAINT epic_alert_history_phase_check CHECK (((phase)::text = ANY ((ARRAY['OVERALL'::character varying, 'DESIGN'::character varying, 'DEV'::character varying, 'TEST'::character varying, 'PENTEST'::character varying, 'R4GOLIVE'::character varying])::text[])))
);

CREATE TABLE epic_alert_row_cache (
    epic_key character varying(40) NOT NULL,
    project_key character varying(40) DEFAULT ''::character varying NOT NULL,
    current_status character varying(100) DEFAULT ''::character varying NOT NULL,
    epic_type character varying(60) DEFAULT ''::character varying NOT NULL,
    requesting_unit character varying(200),
    owner_names text[] DEFAULT '{}'::text[] NOT NULL,
    components text[] DEFAULT '{}'::text[] NOT NULL,
    alert_level character varying(10) DEFAULT 'NONE'::character varying NOT NULL,
    ttm_e2e_alert_level character varying(10) DEFAULT 'NONE'::character varying NOT NULL,
    has_data_anomaly boolean DEFAULT false NOT NULL,
    remaining_working_days integer,
    epic_name text DEFAULT ''::text NOT NULL,
    row_data jsonb NOT NULL,
    source_import_batch_id integer,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    alert_rank integer DEFAULT 3 NOT NULL,
    bottom_status_rank integer DEFAULT 0 NOT NULL,
    remaining_working_days_rank integer DEFAULT 2147483647 NOT NULL,
    ttm_cntt_in_scope boolean DEFAULT true NOT NULL,
    qa_in_scope boolean DEFAULT true NOT NULL,
    badge_codes text[] DEFAULT '{}'::text[] NOT NULL,
    index_flags text[] DEFAULT '{}'::text[] NOT NULL,
    findings jsonb DEFAULT '[]'::jsonb NOT NULL,
    scoring_ruleset_version text,
    scored_as_of date,
    CONSTRAINT epic_alert_row_cache_pkey PRIMARY KEY (epic_key)
);

CREATE TABLE epic_alert_timeline (
    id SERIAL,
    epic_key character varying(50) NOT NULL,
    alert_type character varying(20) NOT NULL,
    start_date date NOT NULL,
    last_seen_date date NOT NULL,
    end_date date,
    detail jsonb,
    source_import_batch_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT epic_alert_timeline_pkey PRIMARY KEY (id),
    CONSTRAINT epic_alert_timeline_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['FAIL_TTM_CNTT'::character varying, 'LATE_TTM_CNTT'::character varying, 'FAIL_TTM_E2E'::character varying, 'MISSING_START_DATE'::character varying, 'DATA_ANOMALY'::character varying])::text[])))
);

CREATE TABLE epic_data_anomaly_violations (
    id SERIAL,
    epic_key character varying(50) NOT NULL,
    rule_code character varying(40) NOT NULL,
    rule_index smallint NOT NULL,
    message text NOT NULL,
    detected_at date NOT NULL,
    source_import_batch_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT epic_data_anomaly_violations_pkey PRIMARY KEY (id),
    CONSTRAINT epic_data_anomaly_violations_epic_key_rule_code_key UNIQUE (epic_key, rule_code),
    CONSTRAINT epic_data_anomaly_violations_rule_code_check CHECK (((rule_code)::text = ANY ((ARRAY['MISSING_START_DATE'::character varying, 'PENDING_TOO_LONG'::character varying, 'DATE_OUT_OF_SEQUENCE'::character varying, 'MISSING_REQUEST_TYPE'::character varying, 'MISSING_REQUIREMENT_LEVEL'::character varying, 'SP_LEVEL_MISMATCH'::character varying, 'RELEASE_STATUS_MISMATCH'::character varying])::text[])))
);

CREATE TABLE epic_milestone_history (
    id SERIAL,
    epic_key character varying(50) NOT NULL,
    milestone character varying(30) NOT NULL,
    milestone_date date NOT NULL,
    source_import_batch_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT epic_milestone_history_pkey PRIMARY KEY (id),
    CONSTRAINT epic_milestone_history_epic_key_milestone_key UNIQUE (epic_key, milestone)
);

CREATE TABLE epic_status_alert_rules (
    id SERIAL,
    epic_complexity_type character varying(20) NOT NULL,
    epic_status character varying(50) NOT NULL,
    early_alert_offset_days integer NOT NULL,
    late_alert_offset_days integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT epic_status_alert_rules_pkey PRIMARY KEY (id),
    CONSTRAINT uq_epic_status_alert_rules_complexity_status UNIQUE (epic_complexity_type, epic_status),
    CONSTRAINT epic_status_alert_rules_early_alert_offset_days_check CHECK ((early_alert_offset_days >= 0)),
    CONSTRAINT epic_status_alert_rules_epic_complexity_type_check CHECK (((epic_complexity_type)::text = ANY ((ARRAY['SIMPLE'::character varying, 'COMPLEX'::character varying, 'CT-Lv12'::character varying, 'CT-Lv34'::character varying, 'SP-Lv12'::character varying, 'SP-Lv34'::character varying])::text[]))),
    CONSTRAINT epic_status_alert_rules_late_alert_offset_days_check CHECK ((late_alert_offset_days >= 0))
);

CREATE TABLE epic_ttm_snapshots (
    id SERIAL,
    epic_key character varying(50) NOT NULL,
    epic_name text,
    project_key character varying(50),
    domain_id integer,
    assignee_name character varying(100),
    current_status character varying(50),
    epic_complexity_type character varying(20),
    idea_approved_date date,
    start_date date,
    r4g_date date,
    due_date date,
    target_r4g_date date,
    source_import_batch_id integer,
    aggregated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    requirement_level character varying(100),
    requesting_unit character varying(255),
    CONSTRAINT epic_ttm_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT epic_ttm_snapshots_epic_key_aggregated_at_key UNIQUE (epic_key, aggregated_at)
);

CREATE TABLE holidays (
    id SERIAL,
    name character varying(255) NOT NULL,
    holiday_type character varying(50) DEFAULT 'COMPANY'::character varying NOT NULL,
    is_multi_day boolean DEFAULT false NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT holidays_pkey PRIMARY KEY (id),
    CONSTRAINT chk_holiday_date_range CHECK ((end_date >= start_date))
);

CREATE TABLE import_admission_settings (
    id smallint DEFAULT 1 NOT NULL,
    created_before date,
    released_due_before date,
    updated_by_user_id integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT import_admission_settings_pkey PRIMARY KEY (id),
    CONSTRAINT import_admission_settings_id_check CHECK ((id = 1))
);

CREATE TABLE import_batches (
    id SERIAL,
    source_type character varying(50) DEFAULT 'CSV'::character varying,
    file_name character varying(255) NOT NULL,
    import_type character varying(50) DEFAULT 'MANUAL'::character varying,
    imported_by character varying(100) DEFAULT 'System'::character varying,
    imported_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    aggregated_at timestamp with time zone NOT NULL,
    total_rows integer DEFAULT 0,
    success_rows integer DEFAULT 0,
    warning_rows integer DEFAULT 0,
    error_rows integer DEFAULT 0,
    status character varying(50) NOT NULL,
    metadata_json text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT import_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE import_rows (
    id SERIAL,
    import_batch_id integer,
    row_number integer NOT NULL,
    normalized_data_json text,
    validation_status character varying(50) NOT NULL,
    validation_errors_json text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT import_rows_pkey PRIMARY KEY (id)
);

CREATE TABLE info_banners (
    id SERIAL,
    name character varying(200) NOT NULL,
    message text NOT NULL,
    banner_type character varying(20) NOT NULL,
    screen_key character varying(200),
    is_active boolean DEFAULT true NOT NULL,
    start_date date NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT info_banners_pkey PRIMARY KEY (id),
    CONSTRAINT chk_info_banners_date_range CHECK (((end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT info_banners_banner_type_check CHECK (((banner_type)::text = ANY ((ARRAY['DEFAULT'::character varying, 'PER_SCREEN'::character varying])::text[])))
);

CREATE TABLE issue_daily_snapshots (
    id SERIAL,
    issue_key character varying(100) NOT NULL,
    issue_type character varying(50) NOT NULL,
    issue_name text,
    jira_id bigint,
    project_key character varying(100),
    epic_key character varying(100),
    parent_key character varying(100),
    assignee_name character varying(255),
    current_status character varying(100),
    epic_complexity_type character varying(20),
    requirement_level character varying(100),
    idea_approved_date date,
    start_date date,
    r4g_date date,
    due_date date,
    target_r4g_date date,
    source_import_batch_id integer,
    aggregated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT issue_daily_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT issue_daily_snapshots_issue_key_aggregated_at_key UNIQUE (issue_key, aggregated_at)
);

CREATE TABLE issue_type_role_mapping (
    id SERIAL,
    issue_type character varying(100) NOT NULL,
    team_role character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT issue_type_role_mapping_pkey PRIMARY KEY (id),
    CONSTRAINT issue_type_role_mapping_issue_type_key UNIQUE (issue_type),
    CONSTRAINT issue_type_role_mapping_team_role_check CHECK (((team_role)::text = ANY ((ARRAY['BA'::character varying, 'DEV'::character varying, 'TEST'::character varying, 'PM'::character varying])::text[])))
);

CREATE TABLE issues (
    id SERIAL,
    source_system character varying(50) DEFAULT 'JIRA'::character varying,
    jira_id bigint NOT NULL,
    issue_key character varying(50) NOT NULL,
    issue_name text NOT NULL,
    issue_type character varying(50) NOT NULL,
    current_status character varying(50) NOT NULL,
    standard_status character varying(50),
    ttm_stage character varying(50),
    assignee_name character varying(100),
    epic_key character varying(50),
    parent_key character varying(50),
    parent_id integer,
    epic_id integer,
    idea_approved_date date,
    start_date date,
    r4g_date date,
    due_date date,
    target_r4g_date date,
    target_due_date date,
    jira_created_at timestamp with time zone,
    jira_updated_at timestamp with time zone,
    epic_complexity_type character varying(50),
    source_import_batch_id integer,
    aggregated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    requirement_level character varying(100),
    epic_stories text[],
    story_subtasks text[],
    components text[],
    requesting_unit character varying(255),
    previous_status character varying(50),
    khau_ba text,
    khau_co text,
    khau_dev text,
    khau_pm_sm text,
    khau_po text,
    khau_pentest text,
    khau_sa text,
    khau_sit_uat text,
    note_ly_do_khac text,
    main_fail_dept text,
    CONSTRAINT issues_pkey PRIMARY KEY (id)
);

CREATE TABLE jira_settings (
    id smallint DEFAULT 1 NOT NULL,
    api_base_url character varying(500) DEFAULT ''::character varying NOT NULL,
    view_issue_base_url character varying(500) DEFAULT ''::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT jira_settings_pkey PRIMARY KEY (id),
    CONSTRAINT jira_settings_id_check CHECK ((id = 1))
);

CREATE TABLE makeup_workdays (
    id SERIAL,
    work_date date NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT makeup_workdays_pkey PRIMARY KEY (id),
    CONSTRAINT makeup_workdays_work_date_key UNIQUE (work_date)
);

CREATE TABLE mcp_access_daily_stats (
    user_id integer NOT NULL,
    stat_date date NOT NULL,
    access_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT mcp_access_daily_stats_pkey PRIMARY KEY (user_id, stat_date)
);

CREATE TABLE mcp_access_tokens (
    id SERIAL,
    user_id integer NOT NULL,
    token_name character varying(255) NOT NULL,
    token_prefix character varying(32) NOT NULL,
    token_hash character varying(255) NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT mcp_access_tokens_pkey PRIMARY KEY (id),
    CONSTRAINT mcp_access_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE TABLE mcp_oauth_authorization_codes (
    id SERIAL,
    code character varying(255) NOT NULL,
    client_id character varying(2048) NOT NULL,
    client_name character varying(255) NOT NULL,
    user_id integer NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT mcp_oauth_authorization_codes_pkey PRIMARY KEY (id),
    CONSTRAINT mcp_oauth_authorization_codes_code_key UNIQUE (code)
);

CREATE TABLE mcp_oauth_clients (
    id SERIAL,
    client_id character varying(64) NOT NULL,
    client_name character varying(255) NOT NULL,
    redirect_uris jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT mcp_oauth_clients_pkey PRIMARY KEY (id),
    CONSTRAINT mcp_oauth_clients_client_id_key UNIQUE (client_id)
);

CREATE TABLE mcp_settings (
    id smallint DEFAULT 1 NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by integer,
    CONSTRAINT mcp_settings_pkey PRIMARY KEY (id),
    CONSTRAINT chk_mcp_settings_singleton CHECK ((id = 1))
);

CREATE TABLE password_reset_requests (
    id SERIAL,
    email character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp with time zone,
    resolved_by integer,
    CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id),
    CONSTRAINT password_reset_requests_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'RESOLVED'::character varying])::text[])))
);

CREATE TABLE permission_features (
    feature_key character varying(60) NOT NULL,
    feature_name character varying(150) NOT NULL,
    category character varying(10) NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT permission_features_pkey PRIMARY KEY (feature_key),
    CONSTRAINT permission_features_category_check CHECK (((category)::text = ANY ((ARRAY['ADMIN'::character varying, 'VIEW_ONLY'::character varying])::text[])))
);

CREATE TABLE project_components (
    id SERIAL,
    project_key character varying(50) NOT NULL,
    component_name character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_components_pkey PRIMARY KEY (id),
    CONSTRAINT uq_project_components_project_component UNIQUE (project_key, component_name)
);

CREATE TABLE project_external_bindings (
    id SERIAL,
    project_id integer NOT NULL,
    system_code character varying(30) DEFAULT 'JIRA'::character varying NOT NULL,
    external_project_id character varying(100),
    external_project_key character varying(100) NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    valid_from date,
    valid_to date,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT project_external_bindings_pkey PRIMARY KEY (id),
    CONSTRAINT chk_peb_valid_range CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from)))
);

CREATE TABLE project_members (
    id SERIAL,
    project_id integer NOT NULL,
    user_id integer NOT NULL,
    role_in_project character varying(50) DEFAULT 'MEMBER'::character varying NOT NULL,
    allocation_percent numeric(5,2),
    joined_at date,
    left_at date,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT project_members_pkey PRIMARY KEY (id),
    CONSTRAINT chk_pm_allocation CHECK (((allocation_percent IS NULL) OR ((allocation_percent >= (0)::numeric) AND (allocation_percent <= (100)::numeric)))),
    CONSTRAINT chk_pm_dates CHECK (((left_at IS NULL) OR (joined_at IS NULL) OR (left_at >= joined_at)))
);

CREATE TABLE project_type_capabilities (
    project_type_id integer NOT NULL,
    capability_code character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT project_type_capabilities_pkey PRIMARY KEY (project_type_id, capability_code)
);

CREATE TABLE project_types (
    id SERIAL,
    type_code character varying(50) NOT NULL,
    type_name character varying(100) NOT NULL,
    legacy_category character varying(30),
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT project_types_pkey PRIMARY KEY (id),
    CONSTRAINT project_types_type_code_key UNIQUE (type_code)
);

CREATE TABLE projects (
    id SERIAL,
    project_name character varying(255) NOT NULL,
    domain_id integer,
    source_project_key character varying(50) NOT NULL,
    source_type character varying(50) DEFAULT 'JIRA'::character varying NOT NULL,
    project_category character varying(30),
    ttm character(1) DEFAULT 'N'::bpchar NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    project_code character varying(50) NOT NULL,
    project_type_id integer,
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT uq_projects_project_code UNIQUE (project_code),
    CONSTRAINT uq_projects_source_project_key UNIQUE (source_project_key),
    CONSTRAINT projects_project_category_check CHECK (((project_category)::text = ANY ((ARRAY['Dự án'::character varying, 'Team Agile'::character varying, 'Team Triển khai'::character varying])::text[]))),
    CONSTRAINT projects_ttm_check CHECK ((ttm = ANY (ARRAY['Y'::bpchar, 'N'::bpchar])))
);

CREATE TABLE role_feature_permissions (
    feature_key character varying(60) NOT NULL,
    role character varying(20) NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    can_add boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    CONSTRAINT role_feature_permissions_pkey PRIMARY KEY (feature_key, role),
    CONSTRAINT role_feature_permissions_role_check CHECK (((role)::text = ANY ((ARRAY['SUPERADMIN'::character varying, 'ADMIN'::character varying, 'SUPERVISOR'::character varying, 'USER'::character varying])::text[])))
);

CREATE TABLE schema_migrations (
    filename character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename)
);

CREATE TABLE scoring_engine_settings (
    id smallint DEFAULT 1 NOT NULL,
    mode text DEFAULT 'legacy'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT scoring_engine_settings_pkey PRIMARY KEY (id),
    CONSTRAINT scoring_engine_settings_id_check CHECK ((id = 1)),
    CONSTRAINT scoring_engine_settings_mode_check CHECK ((mode = ANY (ARRAY['legacy'::text, 'scoring'::text])))
);

CREATE TABLE scoring_parameters (
    param_key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT scoring_parameters_pkey PRIMARY KEY (param_key)
);

CREATE TABLE scoring_parity_runs (
    id SERIAL,
    as_of date NOT NULL,
    source text NOT NULL,
    ruleset_version text NOT NULL,
    epic_count integer NOT NULL,
    identical_epics integer NOT NULL,
    intentional_only_epics integer NOT NULL,
    unexplained_epics integer NOT NULL,
    summary jsonb NOT NULL,
    duration_ms integer,
    computed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    triggered_by_user_id integer,
    CONSTRAINT scoring_parity_runs_pkey PRIMARY KEY (id)
);

CREATE TABLE scoring_rule_settings (
    badge_id text NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT scoring_rule_settings_pkey PRIMARY KEY (badge_id)
);

CREATE TABLE sso_auth_codes (
    id SERIAL,
    code character varying(255) NOT NULL,
    api_key_id integer NOT NULL,
    user_id integer NOT NULL,
    redirect_uri text NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT sso_auth_codes_pkey PRIMARY KEY (id),
    CONSTRAINT sso_auth_codes_code_key UNIQUE (code)
);

CREATE TABLE ttm_dashboard_2_cache (
    scope_key character varying(64) NOT NULL,
    scope_fingerprint character varying(64) NOT NULL,
    source_computed_at text,
    engine_mode character varying(16) NOT NULL,
    summary jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ttm_dashboard_2_cache_pkey PRIMARY KEY (scope_key)
);

CREATE TABLE ttm_index_global_cache (
    id smallint DEFAULT 1 NOT NULL,
    ttm_eligible integer NOT NULL,
    ttm_pass integer NOT NULL,
    ttm_fail integer NOT NULL,
    ttm_total integer NOT NULL,
    ttm_pct_precise numeric(6,3) NOT NULL,
    qa_eligible integer NOT NULL,
    qa_pass integer NOT NULL,
    qa_fail integer NOT NULL,
    qa_total integer NOT NULL,
    qa_pct_precise numeric(6,3) NOT NULL,
    source_import_batch_id integer,
    computed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    e2e_eligible integer DEFAULT 0 NOT NULL,
    e2e_pass integer DEFAULT 0 NOT NULL,
    e2e_fail integer DEFAULT 0 NOT NULL,
    e2e_total integer DEFAULT 0 NOT NULL,
    e2e_pct_precise numeric(6,3) DEFAULT 0 NOT NULL,
    CONSTRAINT ttm_index_global_cache_pkey PRIMARY KEY (id),
    CONSTRAINT ttm_index_global_cache_id_check CHECK ((id = 1))
);

CREATE TABLE ttm_policy_configs (
    id SERIAL,
    ttm_type character varying(20) NOT NULL,
    epic_complexity_type character varying(20) NOT NULL,
    from_ttm_field character varying(100) NOT NULL,
    to_ttm_field character varying(100) NOT NULL,
    working_days integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ttm_policy_configs_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ttm_policy_configs_type_complexity UNIQUE (ttm_type, epic_complexity_type),
    CONSTRAINT ttm_policy_configs_epic_complexity_type_check CHECK (((epic_complexity_type)::text = ANY ((ARRAY['SIMPLE'::character varying, 'COMPLEX'::character varying, 'CT-Lv12'::character varying, 'CT-Lv34'::character varying, 'SP-Lv12'::character varying, 'SP-Lv34'::character varying])::text[]))),
    CONSTRAINT ttm_policy_configs_ttm_type_check CHECK (((ttm_type)::text = ANY ((ARRAY['TTM_CNTT'::character varying, 'TTM_E2E'::character varying])::text[]))),
    CONSTRAINT ttm_policy_configs_working_days_check CHECK (((working_days > 0) AND (working_days <= 3650)))
);

CREATE TABLE ttm_project_configs (
    project_id integer NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    ttm_cntt_enabled boolean DEFAULT true NOT NULL,
    ttm_e2e_enabled boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ttm_project_configs_pkey PRIMARY KEY (project_id)
);

CREATE TABLE ttm_scope_config (
    id smallint DEFAULT 1 NOT NULL,
    cntt_from date,
    cntt_to date,
    qa_from date,
    qa_to date,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT ttm_scope_config_pkey PRIMARY KEY (id),
    CONSTRAINT ttm_scope_config_id_check CHECK ((id = 1))
);

CREATE TABLE user_domains (
    user_id integer NOT NULL,
    domain_id integer NOT NULL,
    CONSTRAINT user_domains_pkey PRIMARY KEY (user_id, domain_id)
);

CREATE TABLE user_project_components (
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    component_name character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_project_components_pkey PRIMARY KEY (user_id, project_id, component_name)
);

CREATE TABLE user_projects (
    user_id integer NOT NULL,
    project_id integer NOT NULL,
    CONSTRAINT user_projects_pkey PRIMARY KEY (user_id, project_id)
);

CREATE TABLE user_usage_daily_stats (
    user_id integer NOT NULL,
    stat_date date NOT NULL,
    login_count integer DEFAULT 0 NOT NULL,
    feature_count integer DEFAULT 0 NOT NULL,
    data_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT user_usage_daily_stats_pkey PRIMARY KEY (user_id, stat_date)
);

CREATE TABLE users (
    id SERIAL,
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    must_change_password boolean DEFAULT true NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['SUPERADMIN'::character varying, 'ADMIN'::character varying, 'SUPERVISOR'::character varying, 'USER'::character varying])::text[])))
);

CREATE TABLE visit_logs (
    id BIGSERIAL,
    event_type character varying(20) NOT NULL,
    screen_key character varying(50),
    user_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT visit_logs_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------------------------
-- 2. Index phụ
-- ---------------------------------------------------------------------------------------------
CREATE INDEX idx_api_keys_active ON api_keys USING btree (is_active);
CREATE INDEX idx_auth_sessions_user_expiry ON auth_sessions USING btree (user_id, expires_at);
CREATE INDEX idx_black_listed_epics_project_key ON black_listed_epics USING btree (project_key);
CREATE INDEX idx_denied_import_epics_project_key ON denied_import_epics USING btree (project_key);
CREATE INDEX idx_epic_alert_history_alert_date ON epic_alert_history USING btree (alert_date);
CREATE INDEX idx_epic_alert_history_epic_key ON epic_alert_history USING btree (epic_key);
CREATE INDEX idx_epic_alert_row_cache_alert_level ON epic_alert_row_cache USING btree (alert_level);
CREATE INDEX idx_epic_alert_row_cache_badge_codes ON epic_alert_row_cache USING gin (badge_codes);
CREATE INDEX idx_epic_alert_row_cache_current_status ON epic_alert_row_cache USING btree (current_status);
CREATE INDEX idx_epic_alert_row_cache_index_flags ON epic_alert_row_cache USING gin (index_flags);
CREATE INDEX idx_epic_alert_row_cache_project_key ON epic_alert_row_cache USING btree (project_key);
CREATE INDEX idx_epic_alert_row_cache_sort ON epic_alert_row_cache USING btree (bottom_status_rank, has_data_anomaly, alert_rank, remaining_working_days_rank);
CREATE INDEX idx_epic_alert_row_cache_ttm_cntt_in_scope ON epic_alert_row_cache USING btree (ttm_cntt_in_scope);
CREATE INDEX idx_epic_alert_timeline_end_date ON epic_alert_timeline USING btree (end_date);
CREATE INDEX idx_epic_alert_timeline_epic_key ON epic_alert_timeline USING btree (epic_key);
CREATE UNIQUE INDEX idx_epic_alert_timeline_open_run ON epic_alert_timeline USING btree (epic_key, alert_type) WHERE (end_date IS NULL);
CREATE INDEX idx_epic_data_anomaly_violations_epic_key ON epic_data_anomaly_violations USING btree (epic_key);
CREATE INDEX idx_epic_data_anomaly_violations_rule_code ON epic_data_anomaly_violations USING btree (rule_code);
CREATE INDEX idx_epic_milestone_history_epic_key ON epic_milestone_history USING btree (epic_key);
CREATE INDEX idx_epic_status_alert_rules_active ON epic_status_alert_rules USING btree (is_active) WHERE is_active;
CREATE INDEX idx_epic_ttm_snapshots_aggregated_at ON epic_ttm_snapshots USING btree (aggregated_at);
CREATE INDEX idx_epic_ttm_snapshots_epic_key ON epic_ttm_snapshots USING btree (epic_key);
CREATE INDEX idx_holidays_range ON holidays USING btree (start_date, end_date) WHERE is_active;
CREATE UNIQUE INDEX uq_info_banners_single_default ON info_banners USING btree (banner_type) WHERE ((banner_type)::text = 'DEFAULT'::text);
CREATE INDEX idx_issue_daily_snapshots_aggregated_at ON issue_daily_snapshots USING btree (aggregated_at DESC);
CREATE INDEX idx_issue_daily_snapshots_epic_key_aggregated_at ON issue_daily_snapshots USING btree (epic_key, aggregated_at DESC) WHERE (epic_key IS NOT NULL);
CREATE INDEX idx_issue_daily_snapshots_parent_key ON issue_daily_snapshots USING btree (parent_key) WHERE (parent_key IS NOT NULL);
CREATE INDEX idx_issue_daily_snapshots_type_aggregated_at ON issue_daily_snapshots USING btree (issue_type, aggregated_at DESC);
CREATE INDEX idx_issue_type_role_mapping_role ON issue_type_role_mapping USING btree (team_role);
CREATE INDEX idx_issues_aggregated_at ON issues USING btree (aggregated_at);
CREATE INDEX idx_issues_batch_id ON issues USING btree (source_import_batch_id);
CREATE INDEX idx_issues_epic_id ON issues USING btree (epic_id) WHERE (epic_id IS NOT NULL);
CREATE INDEX idx_issues_epic_key_aggregated_at ON issues USING btree (epic_key, aggregated_at DESC) WHERE (epic_key IS NOT NULL);
CREATE INDEX idx_issues_key_aggregated_at ON issues USING btree (issue_key, aggregated_at DESC);
CREATE UNIQUE INDEX idx_issues_key_batch ON issues USING btree (issue_key, source_import_batch_id);
CREATE INDEX idx_issues_parent_id ON issues USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX idx_issues_parent_key ON issues USING btree (parent_key) WHERE (parent_key IS NOT NULL);
CREATE INDEX idx_issues_type_status ON issues USING btree (issue_type, current_status);
CREATE INDEX idx_makeup_workdays_active ON makeup_workdays USING btree (work_date) WHERE is_active;
CREATE INDEX idx_mcp_access_daily_stats_date ON mcp_access_daily_stats USING btree (stat_date);
CREATE INDEX idx_mcp_access_tokens_hash ON mcp_access_tokens USING btree (token_hash);
CREATE INDEX idx_mcp_access_tokens_user ON mcp_access_tokens USING btree (user_id);
CREATE INDEX idx_mcp_oauth_codes_code ON mcp_oauth_authorization_codes USING btree (code);
CREATE INDEX idx_mcp_oauth_codes_expires ON mcp_oauth_authorization_codes USING btree (expires_at);
CREATE INDEX idx_project_components_project_active ON project_components USING btree (project_key, is_active);
CREATE INDEX idx_peb_project ON project_external_bindings USING btree (project_id);
CREATE UNIQUE INDEX uq_peb_external_key_per_system ON project_external_bindings USING btree (system_code, upper((external_project_key)::text)) WHERE is_active;
CREATE UNIQUE INDEX uq_peb_primary_per_system ON project_external_bindings USING btree (project_id, system_code) WHERE (is_primary AND is_active);
CREATE INDEX idx_project_members_project ON project_members USING btree (project_id);
CREATE INDEX idx_project_members_user ON project_members USING btree (user_id);
CREATE UNIQUE INDEX uq_project_members_active_role ON project_members USING btree (project_id, user_id, role_in_project) WHERE is_active;
CREATE UNIQUE INDEX uq_project_types_legacy_category ON project_types USING btree (legacy_category) WHERE (legacy_category IS NOT NULL);
CREATE INDEX idx_projects_project_type ON projects USING btree (project_type_id);
CREATE INDEX idx_projects_source_key ON projects USING btree (source_project_key);
CREATE INDEX idx_scoring_parity_runs_computed_at ON scoring_parity_runs USING btree (computed_at DESC);
CREATE INDEX idx_sso_auth_codes_code ON sso_auth_codes USING btree (code);
CREATE INDEX idx_sso_auth_codes_expires ON sso_auth_codes USING btree (expires_at);
CREATE INDEX idx_ttm_project_configs_enabled ON ttm_project_configs USING btree (is_enabled) WHERE is_enabled;
CREATE INDEX idx_user_project_components_lookup ON user_project_components USING btree (user_id, project_id);
CREATE INDEX idx_user_usage_daily_stats_date ON user_usage_daily_stats USING btree (stat_date);
CREATE INDEX idx_user_usage_daily_stats_user ON user_usage_daily_stats USING btree (user_id);
CREATE UNIQUE INDEX idx_users_unique_username ON users USING btree (split_part(lower((email)::text), '@'::text, 1));
CREATE INDEX idx_visit_logs_screen_created ON visit_logs USING btree (screen_key, created_at);
CREATE INDEX idx_visit_logs_type_created ON visit_logs USING btree (event_type, created_at);
CREATE INDEX idx_visit_logs_user_created ON visit_logs USING btree (user_id, created_at);

-- ---------------------------------------------------------------------------------------------
-- 3. Khoá ngoại
-- ---------------------------------------------------------------------------------------------
ALTER TABLE ad_popup_impressions ADD CONSTRAINT ad_popup_impressions_popup_id_fkey FOREIGN KEY (popup_id) REFERENCES ad_popups(id) ON DELETE CASCADE;
ALTER TABLE ad_popup_impressions ADD CONSTRAINT ad_popup_impressions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE black_listed_epics ADD CONSTRAINT black_listed_epics_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE daily_cache_runs ADD CONSTRAINT daily_cache_runs_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE daily_cache_runs ADD CONSTRAINT daily_cache_runs_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE dashboard_view_settings ADD CONSTRAINT dashboard_view_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE denied_import_epics ADD CONSTRAINT denied_import_epics_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE epic_alert_history ADD CONSTRAINT epic_alert_history_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE epic_alert_timeline ADD CONSTRAINT epic_alert_timeline_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE epic_data_anomaly_violations ADD CONSTRAINT epic_data_anomaly_violations_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE epic_milestone_history ADD CONSTRAINT epic_milestone_history_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE epic_ttm_snapshots ADD CONSTRAINT epic_ttm_snapshots_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL;
ALTER TABLE epic_ttm_snapshots ADD CONSTRAINT epic_ttm_snapshots_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE import_admission_settings ADD CONSTRAINT import_admission_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE import_rows ADD CONSTRAINT import_rows_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE;
ALTER TABLE issue_daily_snapshots ADD CONSTRAINT issue_daily_snapshots_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_epic_id_fkey FOREIGN KEY (epic_id) REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE issues ADD CONSTRAINT issues_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE;
ALTER TABLE mcp_access_daily_stats ADD CONSTRAINT mcp_access_daily_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE mcp_access_tokens ADD CONSTRAINT mcp_access_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE mcp_oauth_authorization_codes ADD CONSTRAINT mcp_oauth_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE mcp_settings ADD CONSTRAINT mcp_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE password_reset_requests ADD CONSTRAINT password_reset_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_external_bindings ADD CONSTRAINT project_external_bindings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_members ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE project_members ADD CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE project_type_capabilities ADD CONSTRAINT project_type_capabilities_project_type_id_fkey FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE CASCADE;
ALTER TABLE projects ADD CONSTRAINT projects_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_id_fkey FOREIGN KEY (project_type_id) REFERENCES project_types(id) ON DELETE SET NULL;
ALTER TABLE role_feature_permissions ADD CONSTRAINT role_feature_permissions_feature_key_fkey FOREIGN KEY (feature_key) REFERENCES permission_features(feature_key) ON DELETE CASCADE;
ALTER TABLE scoring_engine_settings ADD CONSTRAINT scoring_engine_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_parameters ADD CONSTRAINT scoring_parameters_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_parity_runs ADD CONSTRAINT scoring_parity_runs_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_rule_settings ADD CONSTRAINT scoring_rule_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sso_auth_codes ADD CONSTRAINT sso_auth_codes_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE;
ALTER TABLE sso_auth_codes ADD CONSTRAINT sso_auth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ttm_index_global_cache ADD CONSTRAINT ttm_index_global_cache_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE ttm_project_configs ADD CONSTRAINT ttm_project_configs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE ttm_scope_config ADD CONSTRAINT ttm_scope_config_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE user_domains ADD CONSTRAINT user_domains_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE;
ALTER TABLE user_domains ADD CONSTRAINT user_domains_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_project_components ADD CONSTRAINT user_project_components_user_id_project_id_fkey FOREIGN KEY (user_id, project_id) REFERENCES user_projects(user_id, project_id) ON DELETE CASCADE;
ALTER TABLE user_projects ADD CONSTRAINT user_projects_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE user_projects ADD CONSTRAINT user_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_usage_daily_stats ADD CONSTRAINT user_usage_daily_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE visit_logs ADD CONSTRAINT visit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------------
-- 5. Hàm & trigger (đồng bộ bảng PMS, sinh project_code)
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION projects_fill_project_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.project_code IS NULL OR BTRIM(NEW.project_code) = '' THEN
        NEW.project_code := NEW.source_project_key;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION projects_sync_pms_tables()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION projects_sync_project_type()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION user_projects_sync_project_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE TRIGGER trg_projects_fill_project_code BEFORE INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION projects_fill_project_code();
CREATE TRIGGER trg_projects_sync_pms_tables AFTER INSERT OR UPDATE OF ttm, source_project_key ON projects FOR EACH ROW EXECUTE FUNCTION projects_sync_pms_tables();
CREATE TRIGGER trg_projects_sync_project_type BEFORE INSERT OR UPDATE OF project_category ON projects FOR EACH ROW EXECUTE FUNCTION projects_sync_project_type();
CREATE TRIGGER trg_user_projects_sync_project_members AFTER INSERT OR DELETE ON user_projects FOR EACH ROW EXECUTE FUNCTION user_projects_sync_project_members();

-- ---------------------------------------------------------------------------------------------
-- 6. Sổ theo dõi migration — 90 migration đã gộp vào cấu trúc trên
-- ---------------------------------------------------------------------------------------------
INSERT INTO schema_migrations (filename) VALUES
    ('20260809_create_project_components.sql'),
    ('20260810_add_project_category.sql'),
    ('20260810_add_project_ttm.sql'),
    ('20260810_allow_custom_epic_alert_statuses.sql'),
    ('20260810_create_auth_rbac_users.sql'),
    ('20260810_create_epic_status_alert_rules.sql'),
    ('20260810_enforce_single_domain_per_user.sql'),
    ('20260811_allow_multiple_domains_per_user.sql'),
    ('20260811_sync_project_lead_assignments.sql'),
    ('20260812_reconcile_project_pm_sm_assignments.sql'),
    ('20260813_create_epic_ttm_snapshots.sql'),
    ('20260814_add_requirement_level.sql'),
    ('20260814_drop_import_rows_raw_data_json.sql'),
    ('20260815_add_jira_timestamps_to_issues.sql'),
    ('20260815_create_issue_daily_snapshots.sql'),
    ('20260816_separate_ttm_policy_from_alert_offsets.sql'),
    ('20260817_allow_free_text_ttm_fields.sql'),
    ('20260818_create_epic_alert_history.sql'),
    ('20260819_create_epic_milestone_history.sql'),
    ('20260820_create_issue_type_role_mapping.sql'),
    ('20260821_add_component_level_permissions.sql'),
    ('20260821_add_phase_to_epic_alert_history.sql'),
    ('20260822_create_permission_matrix.sql'),
    ('20260823_add_epic_story_hierarchy_columns.sql'),
    ('20260823_create_jira_settings.sql'),
    ('20260824_add_supervisor_role.sql'),
    ('20260825_create_user_usage_stats.sql'),
    ('20260826_add_usage_stats_date_index.sql'),
    ('20260827_drop_project_key_use_source_key.sql'),
    ('20260828_add_issues_key_aggregated_at_index.sql'),
    ('20260904_create_makeup_workdays.sql'),
    ('20260905_create_epic_alert_timeline.sql'),
    ('20260905b_add_late_cntt_to_epic_alert_timeline.sql'),
    ('20260905c_add_must_change_password_to_users.sql'),
    ('20260905d_create_ad_popups.sql'),
    ('20260905e_add_timeout_seconds_to_ad_popups.sql'),
    ('20260906_add_force_view_and_size_to_ad_popups.sql'),
    ('20260906b_create_info_banners.sql'),
    ('20260908_drop_projects_lead_name.sql'),
    ('20260908b_widen_epic_complexity_types.sql'),
    ('20260908c_backfill_epic_complexity_types.sql'),
    ('20260909_add_epic_reports_permission.sql'),
    ('20260909_create_api_keys.sql'),
    ('20260909_create_sso_auth_codes.sql'),
    ('20260915_create_mcp_settings.sql'),
    ('20260915b_create_mcp_access_tokens.sql'),
    ('20260915c_create_mcp_access_daily_stats.sql'),
    ('20260916_create_mcp_oauth_clients.sql'),
    ('20260916b_create_mcp_oauth_authorization_codes.sql'),
    ('20260919_add_failed_login_lockout.sql'),
    ('20260922_create_epic_data_anomaly_violations.sql'),
    ('20260923_add_dashboard_new_permission.sql'),
    ('20260923_add_epic_requesting_unit.sql'),
    ('20260924_add_release_status_mismatch_anomaly_rule.sql'),
    ('20260925_add_dashboard_permission.sql'),
    ('20260925_create_epic_alert_row_cache.sql'),
    ('20260925_create_ttm_index_global_cache.sql'),
    ('20260925_epic_alert_row_cache_sort_ranks.sql'),
    ('20260926_add_epic_in_po_permission.sql'),
    ('20260926_create_daily_cache_runs.sql'),
    ('20260926_rename_dashboard_new_to_ttm_dashboard.sql'),
    ('20260926b_create_visit_logs.sql'),
    ('20260927_add_visit_counter_permission.sql'),
    ('20260927b_create_ttm_scope_config.sql'),
    ('20260927c_add_ttm_scope_to_epic_alert_row_cache.sql'),
    ('20260929_create_scoring_service.sql'),
    ('20260930_create_scoring_engine_settings.sql'),
    ('20261001_add_e2e_to_ttm_index_global_cache.sql'),
    ('20261003_add_ttm_dashboard_2_permission.sql'),
    ('20261003b_fix_epic_reports_supervisor_permission.sql'),
    ('20261004_create_ttm_dashboard_2_cache.sql'),
    ('20261005_create_black_listed_epics.sql'),
    ('20261005b_create_derived_cache_refresh_lock.sql'),
    ('20261009_add_epic_previous_status_and_khau_fields.sql'),
    ('20261009a_create_project_types.sql'),
    ('20261009b_add_project_code_and_type.sql'),
    ('20261009c_create_project_external_bindings.sql'),
    ('20261009d_create_ttm_project_configs.sql'),
    ('20261009e_create_project_members.sql'),
    ('20261011_remove_legacy_screen_permissions.sql'),
    ('20261012_add_data_normalization_permission.sql'),
    ('20261014_create_denied_import_epics.sql'),
    ('20261014b_seed_denied_import_epics.sql'),
    ('20261014c_create_dashboard_view_settings.sql'),
    ('20261014d_add_main_fail_dept_to_issues.sql'),
    ('20261019_add_auto_exempt_denied_import_source.sql'),
    ('20261019b_sync_pms_project_tables.sql'),
    ('20261019c_add_epic_deletion_scope_indexes.sql'),
    ('20261019d_add_users_unique_username_index.sql'),
    ('20261020_sync_project_type_on_category_cleared.sql');

COMMIT;
