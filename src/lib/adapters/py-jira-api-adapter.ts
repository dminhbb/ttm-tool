/**
 * Py Jira API Adapter
 *
 * Parses flat CSV files produced by a Python script that calls the Jira REST API.
 *
 * File format rules:
 * - One issue per row (flat structure, no multi-line values assumed)
 * - All date fields use yyyy-mm-dd (ISO date) format
 * - Column `hierarchy_level` identifies the issue level: "epic" | "story" | "subtask"
 *   Subtasks may have many issue types: BA, Sub-task, Design, KSTĐ, DEV, Sub Test Execution…
 *
 * Column schema by level (only relevant columns are populated per row;
 * columns for other levels are present but empty):
 *
 * Epic   : epic_key, epic_name, epic_request_type, epic_idea_approval_date,
 *           epic_start_date, epic_due_date, epic_r4g_date,
 *           epic_created, epic_updated, epic_components
 *
 * Story  : story_key, story_issue_type, story_summary, story_status
 *          + epic_key  (the epic this story belongs to)
 *
 * Subtask: subtask_key, subtask_issue_type, subtask_summary, subtask_status,
 *           subtask_start_date, subtask_due_date
 *           + story_key (the parent story)
 *           + epic_key  (the grandparent epic)
 */

import { parseCSV, RawJiraIssue } from '../csv-parser';

export interface PyJiraApiParseResult {
  issues: RawJiraIssue[];
  headers: string[];
}

/** Normalise hierarchy_level values from the file to a canonical string */
function normaliseHierarchy(raw: string): 'epic' | 'story' | 'subtask' | 'unknown' {
  const val = raw.trim().toLowerCase();
  if (val === 'epic') return 'epic';
  if (val === 'story') return 'story';
  if (val === 'subtask' || val === 'sub-task') return 'subtask';
  return 'unknown';
}

/**
 * Map epic_request_type to the internal COMPLEX/SIMPLE complexity codes.
 * Matches the same convention already used by the Pure Jira Export adapter.
 */
function mapComplexityType(epicRequestType: string): string {
  const upper = epicRequestType.toUpperCase();
  if (upper.includes('COMPLEX') || upper.includes('PHỨC TẠP')) return 'COMPLEX';
  return 'SIMPLE';
}

/**
 * Parse a raw CSV text string in Py Jira API format.
 * Returns a normalised list of RawJiraIssue objects ready for validation.
 */
export function parsePyJiraApi(csvText: string): PyJiraApiParseResult {
  const rows = parseCSV(csvText);

  if (rows.length === 0) {
    return { issues: [], headers: [] };
  }

  const rawHeaders = rows[0].map((h) => h.trim());
  const headers = rawHeaders;

  // Helper: get column index by exact name (case-insensitive)
  const idx = (name: string): number =>
    rawHeaders.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  // Helper: extract project key from issue key (e.g., "SMEDS-101" -> "SMEDS")
  const extractProjectKey = (primaryKey: string, fallbackKey?: string): string => {
    if (primaryKey && primaryKey.includes('-')) {
      return primaryKey.split('-')[0].trim();
    }
    if (fallbackKey && fallbackKey.includes('-')) {
      return fallbackKey.split('-')[0].trim();
    }
    return '';
  };

  // Pre-compute column indices once (avoids repeated linear search)
  const COL = {
    hierarchy_level: idx('hierarchy_level'),
    project_key: idx('project_key') >= 0 ? idx('project_key') : idx('projectKey'),

    // Epic columns
    epic_key: idx('epic_key'),
    epic_name: idx('epic_name'),
    epic_status: idx('epic_status'),         // Optional — not always present in Py Jira API export
    epic_request_type: idx('epic_request_type'),
    epic_idea_approval_date: idx('epic_idea_approval_date'),
    epic_start_date: idx('epic_start_date'),
    epic_due_date: idx('epic_due_date'),
    epic_r4g_date: idx('epic_r4g_date'),
    epic_created: idx('epic_created'),
    epic_updated: idx('epic_updated'),
    epic_components: idx('epic_components'),

    // Story columns
    story_key: idx('story_key'),
    story_issue_type: idx('story_issue_type'),
    story_summary: idx('story_summary'),
    story_status: idx('story_status'),

    // Subtask columns
    subtask_key: idx('subtask_key'),
    subtask_issue_type: idx('subtask_issue_type'),
    subtask_summary: idx('subtask_summary'),
    subtask_status: idx('subtask_status'),
    subtask_start_date: idx('subtask_start_date'),
    subtask_due_date: idx('subtask_due_date'),
  };

  const issues: RawJiraIssue[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];

    const get = (colIdx: number): string => {
      if (colIdx < 0 || colIdx >= row.length) return '';
      return row[colIdx].trim();
    };

    const level = normaliseHierarchy(get(COL.hierarchy_level));

    // Skip rows with unknown / empty hierarchy level
    if (level === 'unknown') continue;

    // The epic_key column is present on every row (epic, story, subtask)
    const epicKey = get(COL.epic_key);

    let issue: RawJiraIssue;

    if (level === 'epic') {
      const epicRequestType = get(COL.epic_request_type);
      const key = get(COL.epic_key);
      const projectKey = get(COL.project_key) || extractProjectKey(key);
      issue = {
        issueKey: key,
        issueId: '',                               // Not provided in this format
        summary: get(COL.epic_name),
        issueType: 'Epic',
        status: get(COL.epic_status) || 'N/A', // Use epic_status if present; default to 'N/A' when absent
        projectKey,
        projectName: '',
        components: get(COL.epic_components),
        assignee: '',
        epicLink: '',
        epicName: get(COL.epic_name),
        epicStatus: '',
        epicType: epicRequestType,
        requirementLevel: '',
        ideaApprovedDate: get(COL.epic_idea_approval_date),
        startDate: get(COL.epic_start_date),
        dueDate: get(COL.epic_due_date),
        r4gDate: get(COL.epic_r4g_date),
        parentId: '',
        rowNumber: r + 1,
        jiraCreatedAt: get(COL.epic_created),
        jiraUpdatedAt: get(COL.epic_updated),
      };
    } else if (level === 'story') {
      const key = get(COL.story_key);
      const projectKey = get(COL.project_key) || extractProjectKey(key, epicKey);
      issue = {
        issueKey: key,
        issueId: '',
        summary: get(COL.story_summary),
        issueType: get(COL.story_issue_type) || 'Story',
        status: get(COL.story_status),
        projectKey,
        projectName: '',
        components: '',
        assignee: '',
        epicLink: epicKey,      // epic_key on the same row is the story's parent epic
        epicName: '',
        epicStatus: '',
        epicType: '',
        requirementLevel: '',
        ideaApprovedDate: '',
        startDate: '',
        dueDate: '',
        r4gDate: '',
        parentId: '',
        rowNumber: r + 1,
        jiraCreatedAt: '',
        jiraUpdatedAt: '',
      };
    } else {
      // subtask
      const key = get(COL.subtask_key);
      const storyKey = get(COL.story_key);
      const projectKey = get(COL.project_key) || extractProjectKey(key, storyKey || epicKey);
      issue = {
        issueKey: key,
        issueId: '',
        summary: get(COL.subtask_summary),
        issueType: get(COL.subtask_issue_type) || 'Sub-task',
        status: get(COL.subtask_status),
        projectKey,
        projectName: '',
        components: '',
        assignee: '',
        epicLink: epicKey,      // epic_key on the same row
        epicName: '',
        epicStatus: '',
        epicType: '',
        requirementLevel: '',
        ideaApprovedDate: '',
        startDate: get(COL.subtask_start_date),
        dueDate: get(COL.subtask_due_date),
        r4gDate: '',
        parentId: storyKey,     // story_key on the same row is the subtask's direct parent
        rowNumber: r + 1,
        jiraCreatedAt: '',
        jiraUpdatedAt: '',
      };
    }

    // Derive epic_complexity_type early so import-service can use it directly
    // (only meaningful for epics, but the field is always present on RawJiraIssue)
    if (level === 'epic') {
      issue.epicType = mapComplexityType(issue.epicType);
    }

    issues.push(issue);
  }

  return { issues, headers };
}
