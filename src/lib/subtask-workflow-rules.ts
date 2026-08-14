/**
 * Core logic: canonical workflow order for level-3 issue types (see issue-hierarchy.ts) —
 * collectively called "Subtask" even though the underlying Jira issue type can vary (Sub-task,
 * Bug, Technical Task, …); they all share this same 3-step workflow. Cancelled and Pending are
 * special statuses outside this sequence (see issue-status-rules.ts) and never appear here.
 */
export const SUBTASK_WORKFLOW_STATUS_ORDER = ['TO DO', 'IN PROGRESS', 'DONE'] as const;

function normalizeSubtaskStatus(status: string): string {
  return status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

export function subtaskWorkflowStatusIndex(status: string): number {
  const index = SUBTASK_WORKFLOW_STATUS_ORDER.indexOf(normalizeSubtaskStatus(status) as (typeof SUBTASK_WORKFLOW_STATUS_ORDER)[number]);
  return index === -1 ? SUBTASK_WORKFLOW_STATUS_ORDER.length : index;
}
