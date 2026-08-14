// Core logic: Cancelled and Pending are special statuses that exist outside every issue type's
// sequential workflow (Epic, Story, Subtask alike) — they can occur at any point in the workflow
// and never participate in workflow-order (before/after) comparisons.
const CANCELLED_STATUS_PATTERN = /cancel/i;
const PENDING_STATUS_PATTERN = /pending/i;

export function isCancelledStatus(status: string): boolean {
  return CANCELLED_STATUS_PATTERN.test(status);
}

export function isPendingStatus(status: string): boolean {
  return PENDING_STATUS_PATTERN.test(status);
}
