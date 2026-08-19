import pool from '@/lib/db';
import type { JiraSettings, JiraSettingsInput } from '@/lib/jira-settings-types';

export async function getJiraSettings(): Promise<JiraSettings> {
  const result = await pool.query<JiraSettings>(`
    SELECT api_base_url AS "apiBaseUrl", view_issue_base_url AS "viewIssueBaseUrl"
    FROM jira_settings
    WHERE id = 1;
  `);
  return result.rows[0] ?? { apiBaseUrl: '', viewIssueBaseUrl: '' };
}

export async function updateJiraSettings(input: JiraSettingsInput): Promise<JiraSettings> {
  const result = await pool.query<JiraSettings>(`
    UPDATE jira_settings
    SET api_base_url = $1, view_issue_base_url = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING api_base_url AS "apiBaseUrl", view_issue_base_url AS "viewIssueBaseUrl";
  `, [input.apiBaseUrl, input.viewIssueBaseUrl]);
  return result.rows[0];
}
