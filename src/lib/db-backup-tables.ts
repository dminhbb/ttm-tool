// Table lists of the backup feature — a plain module (no database import) so tests can read it.

// Allowlist of business tables that can be exported/imported. Session/reset-token
// tables are intentionally excluded — they are ephemeral and meaningless to restore.
export const EXPORTABLE_TABLES: { label: string; tableName: string }[] = [
  { label: 'Người dùng (users)', tableName: 'users' },
  { label: 'Domain nghiệp vụ', tableName: 'domains' },
  { label: 'Dự án', tableName: 'projects' },
  { label: 'User ↔ Domain', tableName: 'user_domains' },
  { label: 'User ↔ Dự án (PM/SM)', tableName: 'user_projects' },
  { label: 'User ↔ Component dự án (PM/SM thu hẹp)', tableName: 'user_project_components' },
  { label: 'Component dự án', tableName: 'project_components' },
  { label: 'Holiday', tableName: 'holidays' },
  { label: 'Ngày làm bù', tableName: 'makeup_workdays' },
  { label: 'Cấu hình cảnh báo Status', tableName: 'epic_status_alert_rules' },
  { label: 'Bộ ngân sách Time to Market', tableName: 'ttm_policy_sets' },
  { label: 'Tiêu chí Time to Market (TTM Policy)', tableName: 'ttm_policy_configs' },
  { label: 'Ánh xạ Issue type → cấp', tableName: 'issue_type_role_mapping' },
  // Configuration that used to be left out (2026-10-19): restoring a backup must not silently drop
  // the black list, the "Từ chối import" list/dates (the next import would let denied Epics back in),
  // the Scoring Service / data-scope settings or the permission matrix. Caches are still left out —
  // "Tạo lại cache" rebuilds them from the tables above.
  { label: 'Phạm vi dữ liệu cho TTM', tableName: 'ttm_scope_config' },
  { label: 'Scoring Service — tham số', tableName: 'scoring_parameters' },
  { label: 'Scoring Service — bật/tắt rule (cũ, không còn dùng)', tableName: 'scoring_rule_settings' },
  { label: 'Rule Management — nhóm rule', tableName: 'scoring_rule_groups' },
  { label: 'Rule Management — rule của từng nhóm', tableName: 'scoring_rule_group_rules' },
  { label: 'Rule Management — lịch sử thay đổi', tableName: 'scoring_rule_group_history' },
  { label: 'Epic ngoại lệ (Black listed)', tableName: 'black_listed_epics' },
  { label: 'Từ chối import — danh sách Epic', tableName: 'denied_import_epics' },
  { label: 'Từ chối import — ngày A/B', tableName: 'import_admission_settings' },
  { label: 'Dashboard Lead view cho tất cả user', tableName: 'dashboard_view_settings' },
  // Added 2026-11-06 (review of Smart export against the schema): TTM project scope, "Quyền xem" grants, global Epic hide.
  { label: 'Dự án áp dụng TTM (ttm_project_configs)', tableName: 'ttm_project_configs' },
  { label: 'Quyền xem — thiết lập theo user', tableName: 'user_view_settings' },
  { label: 'Quyền xem — dự án', tableName: 'user_view_projects' },
  { label: 'Quyền xem — component dự án', tableName: 'user_view_project_components' },
  { label: 'Quyền xem — Epic', tableName: 'user_view_epics' },
  { label: 'Epic ẩn toàn hệ thống (epic_marks)', tableName: 'epic_marks' },
  { label: 'Ma trận phân quyền — chức năng', tableName: 'permission_features' },
  { label: 'Ma trận phân quyền — quyền theo role', tableName: 'role_feature_permissions' },
  { label: 'Cấu hình Jira', tableName: 'jira_settings' },
  // Added 2026-11-07 (Smart export mirrors every small business table, so a test environment matches production).
  { label: 'Popup quảng cáo', tableName: 'ad_popups' },
  { label: 'Popup quảng cáo — lượt hiển thị', tableName: 'ad_popup_impressions' },
  { label: 'Banner thông tin', tableName: 'info_banners' },
  { label: 'Bình luận Epic', tableName: 'epic_comments' },
  { label: 'Trạng thái xử lý Epic (TODO/DONE)', tableName: 'epic_task_status' },
  { label: 'Epic user tự ẩn', tableName: 'epic_hidden_by_users' },
  { label: 'Đăng ký tài khoản — đã đọc', tableName: 'user_registration_reads' },
  { label: 'Lịch sử Epic Fail theo ngày', tableName: 'ttm_dashboard_fail_history' },
  { label: 'Lịch sử chỉ số TTM theo ngày', tableName: 'ttm_dashboard_metric_history' },
  { label: 'Loại dự án (PMS)', tableName: 'project_types' },
  { label: 'Loại dự án — năng lực (PMS)', tableName: 'project_type_capabilities' },
  { label: 'Dự án — thành viên (PMS)', tableName: 'project_members' },
  { label: 'Dự án — liên kết hệ thống ngoài (PMS)', tableName: 'project_external_bindings' },
  { label: 'Thời hạn lưu dữ liệu raw', tableName: 'data_retention_configs' },
  { label: 'Đợt import dữ liệu', tableName: 'import_batches' },
  { label: 'Issues (Epic/Story/Subtask)', tableName: 'issues' },
  { label: 'Dòng thời gian cảnh báo Epic (lịch sử Epic)', tableName: 'epic_alert_timeline' },
  { label: 'Audit log', tableName: 'audit_logs' },
  // Bản tin joined the Smart export 2026-11-07 (owner decision; images are bytea — see formatSqlValue).
  { label: 'Bản tin — phân loại', tableName: 'news_letter_categories' },
  { label: 'Bản tin — bài viết', tableName: 'news_letter_articles' },
  { label: 'Bản tin — ảnh', tableName: 'news_letter_images' },
  { label: 'Bản tin — lịch sử sửa', tableName: 'news_letter_article_edits' },
  { label: 'Bản tin — đã đọc', tableName: 'news_letter_reads' },
];

/**
 * Tables of the Smart export besides import_batches / issues — every small business/config table, so an environment fed
 * with the file matches production (owner 2026-11-07). Every one must be in EXPORTABLE_TABLES (tested).
 * Deliberately NOT exported (see SMART_EXCLUDED_TABLES): sessions / tokens / API keys / OAuth codes (secrets of one
 * environment), derived caches (rebuilt by the target environment), telemetry (visit logs, usage stats),
 * epic_alert_timeline (long history), data_snapshot_dates and schema_migrations (environment-specific) and the MCP settings.
 */
export const SMART_CONFIG_TABLES: readonly string[] = [
  'domains',
  'projects',
  'project_components',
  'users',
  'user_domains',
  'user_projects',
  'user_project_components',
  'holidays',
  'makeup_workdays',
  'epic_status_alert_rules',
  'ttm_policy_sets',
  'ttm_policy_configs',
  'issue_type_role_mapping',
  'ttm_scope_config',
  'ttm_project_configs',
  'scoring_parameters',
  'scoring_rule_settings',
  'scoring_rule_groups',
  'scoring_rule_group_rules',
  'scoring_rule_group_history',
  'black_listed_epics',
  'denied_import_epics',
  'import_admission_settings',
  'dashboard_view_settings',
  'permission_features',
  'role_feature_permissions',
  'user_view_settings',
  'user_view_projects',
  'user_view_project_components',
  'user_view_epics',
  'epic_marks',
  'data_retention_configs',
  'jira_settings',
  'ad_popups',
  'ad_popup_impressions',
  'info_banners',
  'epic_comments',
  'epic_task_status',
  'epic_hidden_by_users',
  'user_registration_reads',
  'ttm_dashboard_fail_history',
  'ttm_dashboard_metric_history',
  'project_types',
  'project_type_capabilities',
  'project_members',
  'project_external_bindings',
  'audit_logs',
  'news_letter_categories',
  'news_letter_articles',
  'news_letter_images',
  'news_letter_article_edits',
  'news_letter_reads',
];

/** Tables a Smart import leaves alone on purpose (documented above) — the "every table is accounted for" test reads this. */
export const SMART_EXCLUDED_TABLES: readonly string[] = [
  'api_keys',
  'auth_sessions',
  'daily_cache_runs',
  'data_snapshot_dates',
  'derived_cache_refresh_lock',
  'epic_alert_row_cache',
  'epic_alert_timeline',
  'mcp_access_daily_stats',
  'mcp_access_tokens',
  'mcp_oauth_authorization_codes',
  'mcp_oauth_clients',
  'mcp_settings',
  'password_reset_requests',
  'schema_migrations',
  'sso_auth_codes',
  // "Tạm dừng hệ thống" is the running state of THIS environment: importing another one's pause could lock everybody out.
  'system_suspension_settings',
  'ttm_dashboard_2_cache',
  'ttm_dashboard_trend_cache',
  'ttm_early_start_cache',
  'ttm_index_global_cache',
  'user_usage_daily_stats',
  'visit_log_rollups',
  'visit_logs',
];

/**
 * Tables that hold a login of one environment (user_id of a session / token / code). A Smart import rewrites `users`
 * (ids may now belong to other people), so these are emptied except for the importing SUPERADMIN's own rows.
 */
export const SMART_SESSION_TABLES: readonly string[] = [
  'auth_sessions',
  'mcp_access_tokens',
  'mcp_oauth_authorization_codes',
  'sso_auth_codes',
];
