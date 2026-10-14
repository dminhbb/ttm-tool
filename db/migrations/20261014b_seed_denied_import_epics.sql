-- The 42 Epics found outside the data scope on 2026-10-14 (Released / MVP Done before 01/07/2026 —
-- checked by the owner on Jira), listed in "Từ chối import" with source SEED. Their descriptive
-- columns come from the newest data layer this database holds of each one (NULL when it holds none).
--
-- This only fills the list: the data itself is removed by the Epic deletion (Quản trị nguồn dữ liệu →
-- Từ chối import → "Xóa dữ liệu còn tồn tại"), never by a migration.
WITH seed(epic_key) AS (
    VALUES
        ('AC-1392'), ('API-164687'), ('API-170746'), ('API-171741'), ('APPPART-753'), ('BPMCN-45013'),
        ('BPMCN-45078'), ('BPMCN-46063'), ('BPMCN-47174'), ('CMMS-9592'), ('CNSPDT-3545'), ('CTQT-28529'),
        ('DL-64143'), ('FCRM-7477'), ('FCRM-7778'), ('FCRM-9144'), ('HCM-128259'), ('MO-28753'),
        ('MO-30896'), ('PAMS-89939'), ('RACARD-8696'), ('RACARD-8798'), ('RACARD-8919'), ('SC-76409'),
        ('SMEDS-105834'), ('SMEDS-106979'), ('TCTHTW-38223'), ('TCTHTW-40743'), ('TTTM-34258'),
        ('MO-29337'), ('WM-27125'), ('API-166546'), ('WM-27389'), ('PMP-65464'), ('USC-5286'),
        ('DL-64066'), ('USC-5372'), ('API-170226'), ('MO-30888'), ('WM-30220'), ('ON-6392'),
        ('RACORE-5178')
),
latest AS (
    SELECT DISTINCT ON (issue_key)
        issue_key, issue_name, current_status, requesting_unit, jira_created_at,
        idea_approved_date, start_date, r4g_date, due_date
    FROM issues
    WHERE issue_key IN (SELECT epic_key FROM seed)
    ORDER BY issue_key, aggregated_at DESC
)
INSERT INTO denied_import_epics (
    epic_key, project_key, summary, status, requesting_unit, created_date,
    idea_approved_date, start_date, r4g_date, due_date, source, reason
)
SELECT
    seed.epic_key, SPLIT_PART(seed.epic_key, '-', 1), latest.issue_name, latest.current_status,
    latest.requesting_unit, (latest.jira_created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    latest.idea_approved_date, latest.start_date, latest.r4g_date, latest.due_date, 'SEED',
    'Released/MVP Done trước 01/07/2026 — ngoài phạm vi dữ liệu nguồn (rà soát 14/10/2026)'
FROM seed
LEFT JOIN latest ON latest.issue_key = seed.epic_key
ON CONFLICT (epic_key) DO NOTHING;
