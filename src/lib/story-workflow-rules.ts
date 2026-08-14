/**
 * Core logic: canonical workflow order for level-2 issue types (Story, Task, Enabler Story —
 * see issue-hierarchy.ts). Cancelled and Pending are special statuses outside this sequence
 * (see issue-status-rules.ts) and never appear in this order.
 */
export const STORY_WORKFLOW_STATUS_ORDER = [
  'TO DO',
  'ANALYZING',
  'READY FOR REFINE',
  'WAITING FOR PLANNING',
  'READY FOR DEV',
  'IN DEV',
  'DEV DONE',
  'READY FOR TEST',
  'IN SIT',
  'SIT DONE',
  'IN UAT',
  'UAT DONE',
  'READY FOR GOLIVE',
  'RELEASED',
] as const;

function normalizeStoryStatus(status: string): string {
  return status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

export function storyWorkflowStatusIndex(status: string): number {
  const index = STORY_WORKFLOW_STATUS_ORDER.indexOf(normalizeStoryStatus(status) as (typeof STORY_WORKFLOW_STATUS_ORDER)[number]);
  return index === -1 ? STORY_WORKFLOW_STATUS_ORDER.length : index;
}
