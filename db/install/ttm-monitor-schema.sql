-- =============================================================================================
-- TTM Monitor — tạo CSDL mới (chỉ cấu trúc, KHÔNG có dữ liệu nghiệp vụ)
-- Sinh tự động bởi scripts/db-schema-export.js từ Supabase (PostgreSQL 17.6) lúc 2026-10-27T16:43:18.420Z.
-- KHÔNG sửa tay: đổi schema bằng một file mới trong db/migrations/ rồi chạy lại script.
--
-- Gồm: 62 bảng, 58 index phụ, 4 hàm, 4 trigger.
-- Yêu cầu: PostgreSQL 14 trở lên, một database RỖNG (không dùng cho DB đã có bảng — sẽ báo lỗi và không
-- tạo gì vì cả file chạy trong một transaction). Không cần extension nào.
--
-- Cách chạy:  psql "postgres://USER:PASS@HOST:5432/ttm_tool" -v ON_ERROR_STOP=1 -f ttm-monitor-schema.sql
--             (hoặc mở file trong pgAdmin / DBeaver và chạy toàn bộ).
--
-- Cuối file ghi sẵn tên các migration đã gộp vào cấu trúc này vào bảng schema_migrations — đó là sổ
-- theo dõi, không phải dữ liệu nghiệp vụ: nhờ vậy `node scripts/migrate-db.js --target=local` trên DB mới
-- chỉ chạy những migration phát sinh SAU thời điểm sinh file.
--
-- Phần 7 (cuối file) là DỮ LIỆU KHỞI TẠO TUỲ CHỌN: cấu hình hiện hành của 20 bảng cấu hình (ma trận phân quyền,
-- tiêu chí TTM, rule cảnh báo, lịch nghỉ, cấu hình Scoring…) + 1 tài khoản SUPERADMIN ban đầu, để ứng dụng chạy được
-- ngay sau khi tạo DB. Bật / tắt bằng CÔNG TẮC ngay bên dưới. Chi tiết: db/install/README.md.
-- =============================================================================================

BEGIN;

-- >>> CÔNG TẮC DỮ LIỆU KHỞI TẠO (phần 7) <<<
--     'on'  = tạo cấu trúc VÀ nạp dữ liệu cấu hình ban đầu + tài khoản SUPERADMIN ban đầu (mặc định)
--     'off' = chỉ tạo cấu trúc (bảng trống) — vd. khi sẽ phục hồi dữ liệu từ môi trường khác ngay sau đó
SELECT set_config('ttm_install.seed_data', 'on', false);

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
    source text DEFAULT 'MANUAL'::text NOT NULL,
    CONSTRAINT black_listed_epics_pkey PRIMARY KEY (epic_key),
    CONSTRAINT black_listed_epics_source_check CHECK ((source = ANY (ARRAY['MANUAL'::text, 'IMPORT'::text])))
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
    history_thinning_enabled boolean DEFAULT false NOT NULL,
    history_thinning_daily_limit integer DEFAULT 50000 NOT NULL,
    history_thinning_last_run_at timestamp with time zone,
    history_thinning_last_run_source character varying(10),
    history_thinning_last_deleted integer,
    history_thinning_last_remaining integer,
    history_thinning_updated_by_user_id integer,
    CONSTRAINT data_retention_configs_pkey PRIMARY KEY (id),
    CONSTRAINT data_retention_configs_history_thinning_daily_limit_check CHECK (((history_thinning_daily_limit >= 1000) AND (history_thinning_daily_limit <= 1000000))),
    CONSTRAINT data_retention_configs_history_thinning_last_run_source_check CHECK (((history_thinning_last_run_source IS NULL) OR ((history_thinning_last_run_source)::text = ANY ((ARRAY['DAILY'::character varying, 'MANUAL'::character varying])::text[])))),
    CONSTRAINT data_retention_configs_id_check CHECK ((id = 1)),
    CONSTRAINT data_retention_configs_raw_import_retention_days_check CHECK (((raw_import_retention_days >= 7) AND (raw_import_retention_days <= 3650)))
);

CREATE TABLE data_snapshot_dates (
    snapshot_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT data_snapshot_dates_pkey PRIMARY KEY (snapshot_date)
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
    stale_since timestamp with time zone,
    stale_reasons text[] DEFAULT '{}'::text[] NOT NULL,
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
    rule_group_id integer,
    rule_group_name text,
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

CREATE TABLE epic_comments (
    id BIGSERIAL,
    epic_key character varying(100) NOT NULL,
    user_id integer,
    user_name text NOT NULL,
    content character varying(256) NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT epic_comments_pkey PRIMARY KEY (id)
);

CREATE TABLE epic_hidden_by_users (
    user_id integer NOT NULL,
    epic_key character varying(100) NOT NULL,
    hidden_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT epic_hidden_by_users_pkey PRIMARY KEY (user_id, epic_key)
);

CREATE TABLE epic_marks (
    epic_key character varying(100) NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    updated_by_user_id integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT epic_marks_pkey PRIMARY KEY (epic_key)
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
    late_alert_percent numeric(7,4) DEFAULT 100 NOT NULL,
    CONSTRAINT epic_status_alert_rules_pkey PRIMARY KEY (id),
    CONSTRAINT uq_epic_status_alert_rules_complexity_status UNIQUE (epic_complexity_type, epic_status),
    CONSTRAINT epic_status_alert_rules_early_alert_offset_days_check CHECK ((early_alert_offset_days >= 0)),
    CONSTRAINT epic_status_alert_rules_epic_complexity_type_check CHECK (((epic_complexity_type)::text = ANY ((ARRAY['SIMPLE'::character varying, 'COMPLEX'::character varying, 'CT-Lv12'::character varying, 'CT-Lv34'::character varying, 'SP-Lv12'::character varying, 'SP-Lv34'::character varying])::text[]))),
    CONSTRAINT epic_status_alert_rules_late_alert_offset_days_check CHECK ((late_alert_offset_days >= 0)),
    CONSTRAINT epic_status_alert_rules_late_alert_percent_check CHECK (((late_alert_percent >= (0)::numeric) AND (late_alert_percent <= (1000)::numeric)))
);

CREATE TABLE epic_task_status (
    epic_key character varying(100) NOT NULL,
    status character varying(10) DEFAULT 'TODO'::character varying NOT NULL,
    updated_by_user_id integer,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT epic_task_status_pkey PRIMARY KEY (epic_key),
    CONSTRAINT epic_task_status_status_check CHECK (((status)::text = ANY ((ARRAY['TODO'::character varying, 'DONE'::character varying])::text[])))
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
    project_key character varying(100),
    request_type character varying(255),
    ttm_applied text,
    except_ttm_plan text,
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

CREATE TABLE scoring_parameters (
    param_key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    CONSTRAINT scoring_parameters_pkey PRIMARY KEY (param_key)
);

CREATE TABLE scoring_rule_group_history (
    id SERIAL,
    saved_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    saved_by_user_id integer,
    config_before jsonb NOT NULL,
    config_after jsonb NOT NULL,
    rule_code_version text NOT NULL,
    CONSTRAINT scoring_rule_group_history_pkey PRIMARY KEY (id)
);

CREATE TABLE scoring_rule_group_rules (
    group_id integer NOT NULL,
    rule_id text NOT NULL,
    state text DEFAULT 'ON'::text NOT NULL,
    CONSTRAINT scoring_rule_group_rules_pkey PRIMARY KEY (group_id, rule_id),
    CONSTRAINT scoring_rule_group_rules_state_check CHECK ((state = ANY (ARRAY['ON'::text, 'OFF'::text])))
);

CREATE TABLE scoring_rule_groups (
    id SERIAL,
    name text NOT NULL,
    priority integer NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_from date,
    created_to date,
    idea_approved_from date,
    idea_approved_to date,
    start_from date,
    start_to date,
    r4g_from date,
    r4g_to date,
    due_from date,
    due_to date,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by_user_id integer,
    ttm_applied text,
    CONSTRAINT scoring_rule_groups_pkey PRIMARY KEY (id),
    CONSTRAINT scoring_rule_groups_created_range CHECK (((created_from IS NULL) OR (created_to IS NULL) OR (created_from <= created_to))),
    CONSTRAINT scoring_rule_groups_default_shape CHECK (((NOT is_default) OR (enabled AND (created_from IS NULL) AND (created_to IS NULL) AND (idea_approved_from IS NULL) AND (idea_approved_to IS NULL) AND (start_from IS NULL) AND (start_to IS NULL) AND (r4g_from IS NULL) AND (r4g_to IS NULL) AND (due_from IS NULL) AND (due_to IS NULL)))),
    CONSTRAINT scoring_rule_groups_due_range CHECK (((due_from IS NULL) OR (due_to IS NULL) OR (due_from <= due_to))),
    CONSTRAINT scoring_rule_groups_idea_range CHECK (((idea_approved_from IS NULL) OR (idea_approved_to IS NULL) OR (idea_approved_from <= idea_approved_to))),
    CONSTRAINT scoring_rule_groups_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT scoring_rule_groups_r4g_range CHECK (((r4g_from IS NULL) OR (r4g_to IS NULL) OR (r4g_from <= r4g_to))),
    CONSTRAINT scoring_rule_groups_start_range CHECK (((start_from IS NULL) OR (start_to IS NULL) OR (start_from <= start_to))),
    CONSTRAINT scoring_rule_groups_ttm_applied_check CHECK (((ttm_applied IS NULL) OR (ttm_applied = ANY (ARRAY['EXCEPTION'::text, 'STANDARD'::text]))))
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
    policy_set character varying(40) DEFAULT 'DEFAULT'::character varying NOT NULL,
    CONSTRAINT ttm_policy_configs_pkey PRIMARY KEY (id),
    CONSTRAINT uq_ttm_policy_configs_set_type_complexity UNIQUE (policy_set, ttm_type, epic_complexity_type),
    CONSTRAINT ttm_policy_configs_epic_complexity_type_check CHECK (((epic_complexity_type)::text = ANY ((ARRAY['SIMPLE'::character varying, 'COMPLEX'::character varying, 'CT-Lv12'::character varying, 'CT-Lv34'::character varying, 'SP-Lv12'::character varying, 'SP-Lv34'::character varying])::text[]))),
    CONSTRAINT ttm_policy_configs_ttm_type_check CHECK (((ttm_type)::text = ANY ((ARRAY['TTM_CNTT'::character varying, 'TTM_E2E'::character varying])::text[]))),
    CONSTRAINT ttm_policy_configs_working_days_check CHECK (((working_days > 0) AND (working_days <= 3650)))
);

CREATE TABLE ttm_policy_sets (
    key character varying(40) NOT NULL,
    name character varying(100) NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ttm_policy_sets_pkey PRIMARY KEY (key),
    CONSTRAINT ttm_policy_sets_key_check CHECK (((key)::text ~ '^[A-Za-z0-9_-]+$'::text))
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
    badge_design_style character varying(20) DEFAULT 'list'::character varying NOT NULL,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_badge_design_style_check CHECK (((badge_design_style)::text = ANY ((ARRAY['list'::character varying, 'minimal'::character varying])::text[]))),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['SUPERADMIN'::character varying, 'ADMIN'::character varying, 'SUPERVISOR'::character varying, 'USER'::character varying])::text[])))
);

CREATE TABLE visit_log_rollups (
    event_type character varying(20) NOT NULL,
    screen_key character varying(50) DEFAULT ''::character varying NOT NULL,
    user_id integer DEFAULT 0 NOT NULL,
    visit_count bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT visit_log_rollups_pkey PRIMARY KEY (event_type, screen_key, user_id)
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
CREATE INDEX idx_epic_alert_row_cache_alert_level ON epic_alert_row_cache USING btree (alert_level);
CREATE INDEX idx_epic_alert_row_cache_badge_codes ON epic_alert_row_cache USING gin (badge_codes);
CREATE INDEX idx_epic_alert_row_cache_current_status ON epic_alert_row_cache USING btree (current_status);
CREATE INDEX idx_epic_alert_row_cache_index_flags ON epic_alert_row_cache USING gin (index_flags);
CREATE INDEX idx_epic_alert_row_cache_project_key ON epic_alert_row_cache USING btree (project_key);
CREATE INDEX idx_epic_alert_row_cache_rule_group ON epic_alert_row_cache USING btree (rule_group_id);
CREATE INDEX idx_epic_alert_row_cache_sort ON epic_alert_row_cache USING btree (bottom_status_rank, has_data_anomaly, alert_rank, remaining_working_days_rank);
CREATE INDEX idx_epic_alert_row_cache_ttm_cntt_in_scope ON epic_alert_row_cache USING btree (ttm_cntt_in_scope);
CREATE INDEX idx_epic_alert_timeline_end_date ON epic_alert_timeline USING btree (end_date);
CREATE INDEX idx_epic_alert_timeline_epic_key ON epic_alert_timeline USING btree (epic_key);
CREATE UNIQUE INDEX idx_epic_alert_timeline_open_run ON epic_alert_timeline USING btree (epic_key, alert_type) WHERE (end_date IS NULL);
CREATE INDEX idx_epic_comments_epic_key_created ON epic_comments USING btree (epic_key, created_at DESC, id DESC);
CREATE INDEX idx_epic_marks_hidden ON epic_marks USING btree (epic_key) WHERE is_hidden;
CREATE INDEX idx_epic_status_alert_rules_active ON epic_status_alert_rules USING btree (is_active) WHERE is_active;
CREATE INDEX idx_holidays_range ON holidays USING btree (start_date, end_date) WHERE is_active;
CREATE UNIQUE INDEX uq_info_banners_single_default ON info_banners USING btree (banner_type) WHERE ((banner_type)::text = 'DEFAULT'::text);
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
CREATE UNIQUE INDEX scoring_rule_groups_name_uq ON scoring_rule_groups USING btree (lower(btrim(name)));
CREATE UNIQUE INDEX scoring_rule_groups_single_default ON scoring_rule_groups USING btree (is_default) WHERE is_default;
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
ALTER TABLE data_retention_configs ADD CONSTRAINT data_retention_configs_history_thinning_updated_by_user_id_fkey FOREIGN KEY (history_thinning_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE denied_import_epics ADD CONSTRAINT denied_import_epics_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE epic_alert_timeline ADD CONSTRAINT epic_alert_timeline_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE epic_hidden_by_users ADD CONSTRAINT epic_hidden_by_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE epic_task_status ADD CONSTRAINT epic_task_status_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE import_admission_settings ADD CONSTRAINT import_admission_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
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
ALTER TABLE scoring_parameters ADD CONSTRAINT scoring_parameters_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_rule_group_history ADD CONSTRAINT scoring_rule_group_history_saved_by_user_id_fkey FOREIGN KEY (saved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_rule_group_rules ADD CONSTRAINT scoring_rule_group_rules_group_id_fkey FOREIGN KEY (group_id) REFERENCES scoring_rule_groups(id) ON DELETE CASCADE;
ALTER TABLE scoring_rule_groups ADD CONSTRAINT scoring_rule_groups_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE scoring_rule_settings ADD CONSTRAINT scoring_rule_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sso_auth_codes ADD CONSTRAINT sso_auth_codes_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE;
ALTER TABLE sso_auth_codes ADD CONSTRAINT sso_auth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ttm_index_global_cache ADD CONSTRAINT ttm_index_global_cache_source_import_batch_id_fkey FOREIGN KEY (source_import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE ttm_policy_configs ADD CONSTRAINT ttm_policy_configs_policy_set_fkey FOREIGN KEY (policy_set) REFERENCES ttm_policy_sets(key);
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
-- 6. Sổ theo dõi migration — 113 migration đã gộp vào cấu trúc trên
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
    ('20261020_sync_project_type_on_category_cleared.sql'),
    ('20261023_drop_issue_snapshot_tables.sql'),
    ('20261024_create_visit_log_rollups.sql'),
    ('20261024b_drop_epic_alert_history.sql'),
    ('20261025_add_issue_columns_and_import_row_issues.sql'),
    ('20261025b_drop_import_rows.sql'),
    ('20261025c_drop_anomaly_violations_and_milestone_history.sql'),
    ('20261026_drop_import_row_issues.sql'),
    ('20261026b_drop_scoring_parity_and_engine_settings.sql'),
    ('20261027_create_data_snapshot_dates.sql'),
    ('20261028_create_scoring_rule_groups.sql'),
    ('20261028b_add_rule_group_to_epic_alert_row_cache.sql'),
    ('20261028c_add_rule_management_permission.sql'),
    ('20261029_add_history_thinning_settings.sql'),
    ('20261030_add_rule_group_rule_state.sql'),
    ('20261031_create_ttm_policy_sets.sql'),
    ('20261101_add_late_alert_percent.sql'),
    ('20261102_add_ttm_applied_to_issues.sql'),
    ('20261103_add_ttm_applied_rules.sql'),
    ('20261104_add_user_badge_design_style.sql'),
    ('20261105_add_cache_stale_marker.sql'),
    ('20261106_add_epic_marks.sql'),
    ('20261107_create_epic_hidden_by_users.sql'),
    ('20261108_create_epic_task_status.sql');

-- ---------------------------------------------------------------------------------------------
-- 7. DỮ LIỆU KHỞI TẠO (tuỳ chọn) — chỉ nạp khi công tắc ttm_install.seed_data = 'on' (đầu file)
--    Cấu hình hiện hành của CSDL Supabase lúc sinh file; khoá ngoại tới users để NULL. Không gồm dữ liệu
--    nghiệp vụ (domain, dự án, user, Epic, danh sách Black listed / Từ chối import, banner, API key).
-- ---------------------------------------------------------------------------------------------

-- permission_features (17 dòng)
INSERT INTO permission_features (feature_key, feature_name, category, display_order)
SELECT * FROM (VALUES
    ('data_normalization'::character varying(60), 'Chuẩn hoá dữ liệu'::character varying(150), 'VIEW_ONLY'::character varying(10), '101'::integer),
    ('data_source'::character varying(60), 'Nguồn dữ liệu'::character varying(150), 'ADMIN'::character varying(10), '20'::integer),
    ('database_backup'::character varying(60), 'Sao lưu / Phục hồi dữ liệu'::character varying(150), 'ADMIN'::character varying(10), '70'::integer),
    ('domains'::character varying(60), 'Quản lý Domain'::character varying(150), 'ADMIN'::character varying(10), '40'::integer),
    ('epic_alerts_15'::character varying(60), 'Quản lý Epic 15'::character varying(150), 'VIEW_ONLY'::character varying(10), '100'::integer),
    ('epic_reports'::character varying(60), 'Báo cáo Epic'::character varying(150), 'VIEW_ONLY'::character varying(10), '85'::integer),
    ('general_settings'::character varying(60), 'Quản lý chung'::character varying(150), 'ADMIN'::character varying(10), '80'::integer),
    ('help_alert_logic'::character varying(60), 'Popup Logic cảnh báo Epic'::character varying(150), 'VIEW_ONLY'::character varying(10), '110'::integer),
    ('help_data_logic'::character varying(60), 'Popup Logic xử lý dữ liệu'::character varying(150), 'VIEW_ONLY'::character varying(10), '120'::integer),
    ('permission_matrix'::character varying(60), 'Ma trận phân quyền'::character varying(150), 'ADMIN'::character varying(10), '10'::integer),
    ('product_docs'::character varying(60), 'Tài liệu sản phẩm'::character varying(150), 'VIEW_ONLY'::character varying(10), '130'::integer),
    ('projects'::character varying(60), 'Quản lý Dự án'::character varying(150), 'ADMIN'::character varying(10), '50'::integer),
    ('rule_management'::character varying(60), 'Rule Management'::character varying(150), 'ADMIN'::character varying(10), '65'::integer),
    ('status_alert_rules'::character varying(60), 'Cấu hình cảnh báo'::character varying(150), 'ADMIN'::character varying(10), '60'::integer),
    ('ttm_dashboard_2'::character varying(60), 'TTM Dashboard 2'::character varying(150), 'VIEW_ONLY'::character varying(10), '83'::integer),
    ('users'::character varying(60), 'Quản lý User'::character varying(150), 'ADMIN'::character varying(10), '30'::integer),
    ('visit_counter'::character varying(60), 'Thống kê truy cập'::character varying(150), 'VIEW_ONLY'::character varying(10), '107'::integer)
) AS seed (feature_key, feature_name, category, display_order)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- role_feature_permissions (68 dòng)
INSERT INTO role_feature_permissions (feature_key, role, can_view, can_add, can_edit, can_delete)
SELECT * FROM (VALUES
    ('data_normalization'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_normalization'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_normalization'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_normalization'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_source'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_source'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('data_source'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('data_source'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('database_backup'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('database_backup'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('database_backup'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('database_backup'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('domains'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'false'::boolean, 'false'::boolean),
    ('domains'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('domains'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('domains'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_alerts_15'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_alerts_15'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_alerts_15'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_alerts_15'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_reports'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_reports'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_reports'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('epic_reports'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('general_settings'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'false'::boolean),
    ('general_settings'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('general_settings'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('general_settings'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_alert_logic'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_alert_logic'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_alert_logic'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_alert_logic'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_data_logic'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_data_logic'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_data_logic'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('help_data_logic'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('permission_matrix'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('permission_matrix'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('permission_matrix'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('permission_matrix'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('product_docs'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('product_docs'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('product_docs'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('product_docs'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('projects'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('projects'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('projects'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('projects'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('rule_management'::character varying(60), 'ADMIN'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('rule_management'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('rule_management'::character varying(60), 'SUPERVISOR'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('rule_management'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('status_alert_rules'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('status_alert_rules'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('status_alert_rules'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('status_alert_rules'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('ttm_dashboard_2'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('ttm_dashboard_2'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('ttm_dashboard_2'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('ttm_dashboard_2'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('users'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'false'::boolean, 'false'::boolean),
    ('users'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'true'::boolean, 'true'::boolean, 'true'::boolean),
    ('users'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('users'::character varying(60), 'USER'::character varying(20), 'false'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('visit_counter'::character varying(60), 'ADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('visit_counter'::character varying(60), 'SUPERADMIN'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('visit_counter'::character varying(60), 'SUPERVISOR'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean),
    ('visit_counter'::character varying(60), 'USER'::character varying(20), 'true'::boolean, 'false'::boolean, 'false'::boolean, 'false'::boolean)
) AS seed (feature_key, role, can_view, can_add, can_edit, can_delete)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- ttm_policy_configs (9 dòng)
INSERT INTO ttm_policy_configs (id, ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active, created_at, updated_at, policy_set)
SELECT * FROM (VALUES
    ('5'::integer, 'TTM_CNTT'::character varying(20), 'CT-Lv12'::character varying(20), 'START_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '15'::integer, 'true'::boolean, '2026-09-08 08:00:05.602233+00'::timestamp with time zone, '2026-09-08 08:00:05.602233+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('6'::integer, 'TTM_CNTT'::character varying(20), 'CT-Lv34'::character varying(20), 'START_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '25'::integer, 'true'::boolean, '2026-09-08 08:00:18.291246+00'::timestamp with time zone, '2026-09-08 08:00:18.291246+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('7'::integer, 'TTM_CNTT'::character varying(20), 'SP-Lv12'::character varying(20), 'START_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '30'::integer, 'true'::boolean, '2026-09-08 08:00:28.008926+00'::timestamp with time zone, '2026-09-08 10:16:29.314162+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('8'::integer, 'TTM_CNTT'::character varying(20), 'SP-Lv34'::character varying(20), 'START_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '30'::integer, 'true'::boolean, '2026-09-08 08:00:40.788707+00'::timestamp with time zone, '2026-09-08 08:00:40.788707+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('9'::integer, 'TTM_E2E'::character varying(20), 'CT-Lv12'::character varying(20), 'IDEA_APPROVED_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '20'::integer, 'true'::boolean, '2026-09-08 08:01:33.599333+00'::timestamp with time zone, '2026-09-26 03:28:49.788743+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('10'::integer, 'TTM_E2E'::character varying(20), 'CT-Lv34'::character varying(20), 'IDEA_APPROVED_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '30'::integer, 'true'::boolean, '2026-09-08 08:01:54.000509+00'::timestamp with time zone, '2026-09-26 03:28:49.788743+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('12'::integer, 'TTM_E2E'::character varying(20), 'SP-Lv12'::character varying(20), 'IDEA_APPROVED_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '50'::integer, 'true'::boolean, '2026-09-08 08:02:18.126798+00'::timestamp with time zone, '2026-09-26 03:28:49.788743+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('13'::integer, 'TTM_E2E'::character varying(20), 'SP-Lv34'::character varying(20), 'IDEA_APPROVED_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '50'::integer, 'true'::boolean, '2026-09-08 08:02:30.998561+00'::timestamp with time zone, '2026-09-26 03:28:49.788743+00'::timestamp with time zone, 'DEFAULT'::character varying(40)),
    ('14'::integer, 'TTM_CNTT'::character varying(20), 'CT-Lv34'::character varying(20), 'START_DATE'::character varying(100), 'R4G_DATE'::character varying(100), '30'::integer, 'true'::boolean, '2026-10-26 07:10:53.325116+00'::timestamp with time zone, '2026-10-26 07:10:53.325116+00'::timestamp with time zone, 'legacy-30d'::character varying(40))
) AS seed (id, ttm_type, epic_complexity_type, from_ttm_field, to_ttm_field, working_days, is_active, created_at, updated_at, policy_set)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('ttm_policy_configs', 'id'), MAX(id)) FROM ttm_policy_configs HAVING MAX(id) IS NOT NULL;

-- epic_status_alert_rules (8 dòng)
INSERT INTO epic_status_alert_rules (id, epic_complexity_type, epic_status, early_alert_offset_days, late_alert_offset_days, is_active, created_at, updated_at, late_alert_percent)
SELECT * FROM (VALUES
    ('9'::integer, 'CT-Lv12'::character varying(20), 'Design'::character varying(50), '1'::integer, '3'::integer, 'true'::boolean, '2026-09-08 11:51:17.421277+00'::timestamp with time zone, '2026-09-10 10:26:25.834365+00'::timestamp with time zone, '20.0000'::numeric(7,4)),
    ('10'::integer, 'CT-Lv12'::character varying(20), 'In Progress'::character varying(50), '13'::integer, '13'::integer, 'true'::boolean, '2026-09-08 11:51:42.985843+00'::timestamp with time zone, '2026-10-26 07:39:32.675207+00'::timestamp with time zone, '85.0000'::numeric(7,4)),
    ('11'::integer, 'CT-Lv34'::character varying(20), 'Design'::character varying(50), '3'::integer, '5'::integer, 'true'::boolean, '2026-09-08 11:52:51.614629+00'::timestamp with time zone, '2026-09-10 10:26:38.309094+00'::timestamp with time zone, '20.0000'::numeric(7,4)),
    ('12'::integer, 'CT-Lv34'::character varying(20), 'In Progress'::character varying(50), '23'::integer, '22'::integer, 'true'::boolean, '2026-09-08 11:53:30.405654+00'::timestamp with time zone, '2026-10-26 07:39:41.024962+00'::timestamp with time zone, '85.0000'::numeric(7,4)),
    ('13'::integer, 'SP-Lv12'::character varying(20), 'Design'::character varying(50), '5'::integer, '7'::integer, 'true'::boolean, '2026-09-08 11:53:55.040439+00'::timestamp with time zone, '2026-09-10 10:26:52.813701+00'::timestamp with time zone, '23.3333'::numeric(7,4)),
    ('14'::integer, 'SP-Lv12'::character varying(20), 'In Progress'::character varying(50), '28'::integer, '26'::integer, 'true'::boolean, '2026-09-08 11:54:17.943469+00'::timestamp with time zone, '2026-10-26 07:39:51.041727+00'::timestamp with time zone, '85.0000'::numeric(7,4)),
    ('15'::integer, 'SP-Lv34'::character varying(20), 'Design'::character varying(50), '5'::integer, '7'::integer, 'true'::boolean, '2026-09-08 11:54:34.248874+00'::timestamp with time zone, '2026-09-10 10:26:58.390135+00'::timestamp with time zone, '23.3333'::numeric(7,4)),
    ('17'::integer, 'SP-Lv34'::character varying(20), 'In Progress'::character varying(50), '28'::integer, '26'::integer, 'true'::boolean, '2026-09-08 11:54:49.922323+00'::timestamp with time zone, '2026-10-26 07:39:56.704069+00'::timestamp with time zone, '85.0000'::numeric(7,4))
) AS seed (id, epic_complexity_type, epic_status, early_alert_offset_days, late_alert_offset_days, is_active, created_at, updated_at, late_alert_percent)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('epic_status_alert_rules', 'id'), MAX(id)) FROM epic_status_alert_rules HAVING MAX(id) IS NOT NULL;

-- issue_type_role_mapping (8 dòng)
INSERT INTO issue_type_role_mapping (id, issue_type, team_role, created_at, updated_at)
SELECT * FROM (VALUES
    ('1'::integer, 'BA'::character varying(100), 'BA'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('2'::integer, 'DEV'::character varying(100), 'DEV'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('3'::integer, 'Design'::character varying(100), 'TEST'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-20 02:38:19.689208+00'::timestamp with time zone),
    ('4'::integer, 'Review TKCT'::character varying(100), 'DEV'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('5'::integer, 'Sub test execution'::character varying(100), 'TEST'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('6'::integer, 'UAT'::character varying(100), 'TEST'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('7'::integer, 'KSTĐ'::character varying(100), 'TEST'::character varying(10), '2026-08-15 09:27:24.266523+00'::timestamp with time zone, '2026-08-15 09:27:24.266523+00'::timestamp with time zone),
    ('8'::integer, 'Elicitate'::character varying(100), 'BA'::character varying(10), '2026-08-20 02:38:04.021615+00'::timestamp with time zone, '2026-08-20 02:38:04.021615+00'::timestamp with time zone)
) AS seed (id, issue_type, team_role, created_at, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('issue_type_role_mapping', 'id'), MAX(id)) FROM issue_type_role_mapping HAVING MAX(id) IS NOT NULL;

-- ttm_scope_config (1 dòng)
INSERT INTO ttm_scope_config (id, cntt_from, cntt_to, qa_from, qa_to, updated_at, updated_by_user_id)
SELECT * FROM (VALUES
    ('1'::smallint, NULL::date, NULL::date, NULL::date, NULL::date, '2026-10-01 10:57:20.94944+00'::timestamp with time zone, NULL::integer)
) AS seed (id, cntt_from, cntt_to, qa_from, qa_to, updated_at, updated_by_user_id)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- holidays (5 dòng)
INSERT INTO holidays (id, name, holiday_type, is_multi_day, start_date, end_date, description, is_active, created_at, updated_at)
SELECT * FROM (VALUES
    ('2'::integer, 'Nghỉ Lễ Quốc Khánh 2/9'::character varying(255), 'PUBLIC'::character varying(50), 'true'::boolean, '2026-08-29'::date, '2026-09-02'::date, NULL::text, 'true'::boolean, '2026-08-09 13:34:20.456802+00'::timestamp with time zone, '2026-09-09 16:10:44.604186+00'::timestamp with time zone),
    ('3'::integer, 'Nghỉ Lễ 2/9'::character varying(255), 'PUBLIC'::character varying(50), 'true'::boolean, '2027-08-29'::date, '2027-09-02'::date, NULL::text, 'true'::boolean, '2026-09-04 15:39:43.864452+00'::timestamp with time zone, '2026-09-04 15:39:43.864452+00'::timestamp with time zone),
    ('4'::integer, 'Ngày Văn hóa Việt Nam'::character varying(255), 'PUBLIC'::character varying(50), 'false'::boolean, '2026-11-24'::date, '2026-11-24'::date, 'Làm bù vào 28/11/2026'::text, 'true'::boolean, '2026-09-09 16:10:29.782736+00'::timestamp with time zone, '2026-10-24 10:44:27.037585+00'::timestamp with time zone),
    ('5'::integer, 'Nghỉ Tết Dương lịch'::character varying(255), 'OTHER'::character varying(50), 'false'::boolean, '2027-01-01'::date, '2027-01-01'::date, NULL::text, 'true'::boolean, '2026-09-09 16:12:39.762681+00'::timestamp with time zone, '2026-09-09 16:12:39.762681+00'::timestamp with time zone),
    ('6'::integer, 'Nghỉ Lễ 30/4-1/5'::character varying(255), 'PUBLIC'::character varying(50), 'true'::boolean, '2027-04-30'::date, '2027-05-03'::date, NULL::text, 'true'::boolean, '2026-09-09 16:13:37.680664+00'::timestamp with time zone, '2026-09-09 16:13:37.680664+00'::timestamp with time zone)
) AS seed (id, name, holiday_type, is_multi_day, start_date, end_date, description, is_active, created_at, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('holidays', 'id'), MAX(id)) FROM holidays HAVING MAX(id) IS NOT NULL;

-- makeup_workdays (2 dòng)
INSERT INTO makeup_workdays (id, work_date, description, is_active, created_at, updated_at)
SELECT * FROM (VALUES
    ('1'::integer, '2026-08-22'::date, 'Làm bù nghỉ Lễ Quốc Khánh'::text, 'true'::boolean, '2026-09-04 08:55:38.989401+00'::timestamp with time zone, '2026-09-09 16:10:59.702748+00'::timestamp with time zone),
    ('2'::integer, '2027-08-22'::date, NULL::text, 'true'::boolean, '2026-09-04 15:39:44.777032+00'::timestamp with time zone, '2026-09-04 15:39:44.777032+00'::timestamp with time zone)
) AS seed (id, work_date, description, is_active, created_at, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('makeup_workdays', 'id'), MAX(id)) FROM makeup_workdays HAVING MAX(id) IS NOT NULL;

-- scoring_parameters: không có dòng nào trên CSDL nguồn.
-- scoring_rule_settings: không có dòng nào trên CSDL nguồn.
-- scoring_rule_groups (5 dòng)
INSERT INTO scoring_rule_groups (id, name, priority, is_default, enabled, created_from, created_to, idea_approved_from, idea_approved_to, start_from, start_to, r4g_from, r4g_to, due_from, due_to, created_at, updated_at, updated_by_user_id, ttm_applied)
SELECT * FROM (VALUES
    ('1'::integer, 'Default'::text, '0'::integer, 'true'::boolean, 'true'::boolean, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-10-25 14:54:57.868428+00'::timestamp with time zone, '2026-10-26 16:34:10.314856+00'::timestamp with time zone, NULL::integer, NULL::text),
    ('5'::integer, 'Nhóm R4G ≤ 30/9/2026'::text, '4'::integer, 'false'::boolean, 'true'::boolean, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-09-30'::date, NULL::date, NULL::date, '2026-10-26 07:41:55.49337+00'::timestamp with time zone, '2026-10-26 16:34:10.314856+00'::timestamp with time zone, NULL::integer, NULL::text),
    ('6'::integer, 'Nhóm Start ≤ 31/8/2026'::text, '3'::integer, 'false'::boolean, 'true'::boolean, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-08-31'::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-10-26 07:43:18.317549+00'::timestamp with time zone, '2026-10-26 16:34:10.314856+00'::timestamp with time zone, NULL::integer, NULL::text),
    ('7'::integer, 'Nhóm QA-25 ngày'::text, '2'::integer, 'false'::boolean, 'true'::boolean, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-08-31'::date, '2026-10-01'::date, NULL::date, NULL::date, NULL::date, '2026-10-26 07:44:25.399961+00'::timestamp with time zone, '2026-10-26 16:34:10.314856+00'::timestamp with time zone, NULL::integer, NULL::text),
    ('8'::integer, 'Nhóm Kế hoạch ngoại lệ TTM'::text, '1'::integer, 'false'::boolean, 'true'::boolean, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, NULL::date, '2026-10-26 12:26:56.86824+00'::timestamp with time zone, '2026-10-26 16:34:10.314856+00'::timestamp with time zone, NULL::integer, 'EXCEPTION'::text)
) AS seed (id, name, priority, is_default, enabled, created_from, created_to, idea_approved_from, idea_approved_to, start_from, start_to, r4g_from, r4g_to, due_from, due_to, created_at, updated_at, updated_by_user_id, ttm_applied)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('scoring_rule_groups', 'id'), MAX(id)) FROM scoring_rule_groups HAVING MAX(id) IS NOT NULL;

-- scoring_rule_group_rules (20 dòng)
INSERT INTO scoring_rule_group_rules (group_id, rule_id, state)
SELECT * FROM (VALUES
    ('1'::integer, 'dq-r1'::text, 'ON'::text),
    ('1'::integer, 'dq-r10'::text, 'ON'::text),
    ('1'::integer, 'dq-r11'::text, 'ON'::text),
    ('1'::integer, 'dq-r2'::text, 'ON'::text),
    ('1'::integer, 'dq-r3'::text, 'ON'::text),
    ('1'::integer, 'dq-r4'::text, 'ON'::text),
    ('1'::integer, 'dq-r5'::text, 'ON'::text),
    ('1'::integer, 'dq-r6'::text, 'ON'::text),
    ('1'::integer, 'dq-r8'::text, 'ON'::text),
    ('1'::integer, 'dq-r9'::text, 'ON'::text),
    ('1'::integer, 'fail-reason-dept'::text, 'ON'::text),
    ('1'::integer, 'fail-reason-stage'::text, 'ON'::text),
    ('1'::integer, 'release-justify-golive'::text, 'ON'::text),
    ('1'::integer, 'release-waiting-golive'::text, 'ON'::text),
    ('1'::integer, 'ttm-cntt-sep-2026'::text, 'ON'::text),
    ('1'::integer, 'ttm-e2e-july-2026'::text, 'ON'::text),
    ('5'::integer, 'ttm-cntt-legacy-30d'::text, 'ON'::text),
    ('6'::integer, 'ttm-cntt-legacy-30d'::text, 'ON'::text),
    ('7'::integer, 'ttm-cntt-sep-2026'::text, 'ON'::text),
    ('8'::integer, 'ttm-cntt-except-plan'::text, 'ON'::text)
) AS seed (group_id, rule_id, state)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- project_types (3 dòng)
INSERT INTO project_types (id, type_code, type_name, legacy_category, description, sort_order, is_active, created_at, updated_at)
SELECT * FROM (VALUES
    ('1'::integer, 'DELIVERY_PROJECT'::character varying(50), 'Dự án'::character varying(100), 'Dự án'::character varying(30), 'Dự án triển khai: mốc kế hoạch theo năm, checklist triển khai và kế hoạch thực thi chi tiết.'::text, '1'::integer, 'true'::boolean, '2026-10-11 13:48:24.87349+00'::timestamp with time zone, '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('2'::integer, 'AGILE_TEAM'::character varying(50), 'Team Agile'::character varying(100), 'Team Agile'::character varying(30), 'Team Agile: lập kế hoạch theo quý/tháng và kiểm soát backlog đầu vào.'::text, '2'::integer, 'true'::boolean, '2026-10-11 13:48:24.87349+00'::timestamp with time zone, '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('3'::integer, 'DEPLOYMENT_TEAM'::character varying(50), 'Team Triển khai'::character varying(100), 'Team Triển khai'::character varying(30), 'Team triển khai. Bộ năng lực dưới đây là mặc định tạm thời, CẦN chủ sở hữu nghiệp vụ xác nhận.'::text, '3'::integer, 'true'::boolean, '2026-10-11 13:48:24.87349+00'::timestamp with time zone, '2026-10-11 13:48:24.87349+00'::timestamp with time zone)
) AS seed (id, type_code, type_name, legacy_category, description, sort_order, is_active, created_at, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';
SELECT setval(pg_get_serial_sequence('project_types', 'id'), MAX(id)) FROM project_types HAVING MAX(id) IS NOT NULL;

-- project_type_capabilities (9 dòng)
INSERT INTO project_type_capabilities (project_type_id, capability_code, created_at)
SELECT * FROM (VALUES
    ('1'::integer, 'CHECKLIST'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('1'::integer, 'GANTT'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('1'::integer, 'IMPLEMENTATION_PLAN'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('1'::integer, 'MILESTONE'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('2'::integer, 'BACKLOG'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('2'::integer, 'CAPACITY'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('2'::integer, 'PLANNING_PERIOD'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('3'::integer, 'CHECKLIST'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone),
    ('3'::integer, 'MILESTONE'::character varying(50), '2026-10-11 13:48:24.87349+00'::timestamp with time zone)
) AS seed (project_type_id, capability_code, created_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- jira_settings (1 dòng)
INSERT INTO jira_settings (id, api_base_url, view_issue_base_url, updated_at)
SELECT * FROM (VALUES
    ('1'::smallint, 'https://jira.mbbank.com.vn/rest/api/2'::character varying(500), 'https://jira.mbbank.com.vn/browse/'::character varying(500), '2026-08-19 07:33:59.095955+00'::timestamp with time zone)
) AS seed (id, api_base_url, view_issue_base_url, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- data_retention_configs (1 dòng)
INSERT INTO data_retention_configs (id, raw_import_retention_days, updated_at, history_thinning_enabled, history_thinning_daily_limit, history_thinning_last_run_at, history_thinning_last_run_source, history_thinning_last_deleted, history_thinning_last_remaining, history_thinning_updated_by_user_id)
SELECT * FROM (VALUES
    ('1'::smallint, '200'::integer, '2026-09-26 07:33:15.97024+00'::timestamp with time zone, 'false'::boolean, '50000'::integer, NULL::timestamp with time zone, NULL::character varying(10), NULL::integer, NULL::integer, NULL::integer)
) AS seed (id, raw_import_retention_days, updated_at, history_thinning_enabled, history_thinning_daily_limit, history_thinning_last_run_at, history_thinning_last_run_source, history_thinning_last_deleted, history_thinning_last_remaining, history_thinning_updated_by_user_id)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- mcp_settings (1 dòng)
INSERT INTO mcp_settings (id, is_enabled, updated_at, updated_by)
SELECT * FROM (VALUES
    ('1'::smallint, 'true'::boolean, '2026-10-05 07:49:08.950632+00'::timestamp with time zone, NULL::integer)
) AS seed (id, is_enabled, updated_at, updated_by)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- dashboard_view_settings (1 dòng)
INSERT INTO dashboard_view_settings (id, lead_view_for_all_users, updated_by_user_id, updated_at)
SELECT * FROM (VALUES
    ('1'::smallint, 'true'::boolean, NULL::integer, '2026-10-14 08:09:37.192363+00'::timestamp with time zone)
) AS seed (id, lead_view_for_all_users, updated_by_user_id, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- import_admission_settings (1 dòng)
INSERT INTO import_admission_settings (id, created_before, released_due_before, updated_by_user_id, updated_at)
SELECT * FROM (VALUES
    ('1'::smallint, '2026-02-01'::date, '2026-07-01'::date, NULL::integer, '2026-10-14 16:58:03.212007+00'::timestamp with time zone)
) AS seed (id, created_before, released_due_before, updated_by_user_id, updated_at)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- derived_cache_refresh_lock (1 dòng)
INSERT INTO derived_cache_refresh_lock (id, request_seq, lease_owner, lease_until, last_source, updated_at, stale_since, stale_reasons)
SELECT * FROM (VALUES
    ('1'::smallint, '0'::bigint, NULL::character varying(64), NULL::timestamp with time zone, NULL::character varying(100), '2026-10-27 11:26:52.254195+00'::timestamp with time zone, NULL::timestamp with time zone, '{}'::text[])
) AS seed (id, request_seq, lease_owner, lease_until, last_source, updated_at, stale_since, stale_reasons)
WHERE current_setting('ttm_install.seed_data', true) = 'on';

-- Tài khoản SUPERADMIN ban đầu — username đăng nhập: admin ; mật khẩu ban đầu ghi ở db/install/README.md.
-- Bắt buộc đổi mật khẩu ở lần đăng nhập đầu (must_change_password = TRUE). Đổi mật khẩu ban đầu: thay mã băm bcrypt dưới đây.
INSERT INTO users (email, full_name, password_hash, role, is_active, must_change_password)
SELECT 'admin@mbbank.com.vn', 'Quản trị hệ thống', '$2b$12$JsTMJWq5FrYs7uJ1yu7Vhux5tSWfNDVJUjbNf.Uz6UTRiqJfIkO3.', 'SUPERADMIN', TRUE, TRUE
WHERE current_setting('ttm_install.seed_data', true) = 'on';

COMMIT;
