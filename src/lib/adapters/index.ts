/**
 * Adapter registry — defines all available import adapters and the system default.
 *
 * PURE_JIRA_EXPORT : CSV exported directly from Jira UI (legacy Jira export format)
 * PY_JIRA_API      : Flat CSV produced by a Python script that calls the Jira REST API;
 *                    uses hierarchy_level column + prefixed column names per level.
 */

export const ADAPTER_TYPES = {
  PY_JIRA_API: 'PY_JIRA_API',
  PURE_JIRA_EXPORT: 'PURE_JIRA_EXPORT',
} as const;

export type AdapterType = (typeof ADAPTER_TYPES)[keyof typeof ADAPTER_TYPES];

/** Adapter shown first in the UI and pre-selected for new imports */
export const DEFAULT_ADAPTER: AdapterType = ADAPTER_TYPES.PY_JIRA_API;

/** Human-readable labels used in UI selects / logs */
export const ADAPTER_LABELS: Record<AdapterType, string> = {
  PY_JIRA_API: 'Py Jira API',
  PURE_JIRA_EXPORT: 'Pure Jira Export',
};
