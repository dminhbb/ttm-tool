/** Canonical workflow for Epic 15. Jira's legacy `In Progress` is treated as DEV. The phase rules
 * themselves (baselines, completion, late alerts) live in the Epic Scoring Service (src/lib/scoring). */
export const EPIC_WORKFLOW_STATUS_ORDER = ['TO DO', 'IN PO', 'DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE', 'MVPDONE', 'RELEASED'] as const;

const STATUS_ALIASES: Record<string, (typeof EPIC_WORKFLOW_STATUS_ORDER)[number]> = {
  'IN PROGRESS': 'DEV',
  'IN DEV': 'DEV',
  'PEN TEST': 'PENTEST',
  'READY FOR GOLIVE': 'R4GOLIVE',
  'READY4GOLIVE': 'R4GOLIVE',
};

export function normalizeEpicWorkflowStatus(status: string): string {
  const normalized = status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
  return STATUS_ALIASES[normalized] ?? normalized;
}

export function epicWorkflowStatusIndex(status: string): number {
  const index = EPIC_WORKFLOW_STATUS_ORDER.indexOf(normalizeEpicWorkflowStatus(status) as (typeof EPIC_WORKFLOW_STATUS_ORDER)[number]);
  return index === -1 ? EPIC_WORKFLOW_STATUS_ORDER.length : index;
}
