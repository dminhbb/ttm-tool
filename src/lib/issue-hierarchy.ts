/**
 * Core logic: Jira issue types used by this app are grouped into 3 hierarchy levels.
 * - Level 1 — Epic, CTNB.
 * - Level 2 — Story, Task, Enabler Story.
 * - Level 3 — every other issue type (Sub-task, Bug, Technical Task, …), collectively referred
 *   to as "Subtask" regardless of each issue's own literal Jira issue type name.
 */
export const ISSUE_LEVEL_1_TYPES = ['EPIC', 'CTNB'] as const;
export const ISSUE_LEVEL_2_TYPES = ['STORY', 'TASK', 'ENABLER STORY'] as const;

export type IssueHierarchyLevel = 1 | 2 | 3;

function normalizeIssueType(issueType: string): string {
  return issueType.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

export function getIssueHierarchyLevel(issueType: string): IssueHierarchyLevel {
  const normalized = normalizeIssueType(issueType);
  if ((ISSUE_LEVEL_1_TYPES as readonly string[]).includes(normalized)) return 1;
  if ((ISSUE_LEVEL_2_TYPES as readonly string[]).includes(normalized)) return 2;
  return 3;
}

export function isLevel1IssueType(issueType: string): boolean {
  return getIssueHierarchyLevel(issueType) === 1;
}

export function isLevel2IssueType(issueType: string): boolean {
  return getIssueHierarchyLevel(issueType) === 2;
}

/**
 * "Task PENTEST" (owner 2026-11-09): an issue of type Task in the Jira project PENTEST (key "PENTEST-…"), linked
 * straight to an Epic. The crawl writes it as a STORY row, so it is level 2 under its Epic like a Story — but the
 * phase rules count it as Pentest work (like a Pentest subtask), never in the Stories' DEV / TEST share
 * (see epic-phase-completion-service.ts and scoring/story-phase.ts).
 */
export const PENTEST_TASK_KEY_PREFIX = 'PENTEST-';

export function isPentestTask(issueType: string, issueKey: string): boolean {
  return normalizeIssueType(issueType) === 'TASK' && issueKey.trim().toLocaleUpperCase('en-US').startsWith(PENTEST_TASK_KEY_PREFIX);
}

/** SQL twin of isPentestTask for a row alias holding `issue_type` / `issue_key` (or the given columns). */
export function pentestTaskSql(issueTypeColumn: string, issueKeyColumn: string): string {
  return `(UPPER(TRIM(${issueTypeColumn})) = 'TASK' AND UPPER(TRIM(${issueKeyColumn})) LIKE '${PENTEST_TASK_KEY_PREFIX}%')`;
}

/** Level 3 issue types are collectively "Subtask", whatever their literal Jira issue type name is. */
export function isSubtaskIssueType(issueType: string): boolean {
  return getIssueHierarchyLevel(issueType) === 3;
}
