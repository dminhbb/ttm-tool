import type { PoolClient } from 'pg';
import type { RawJiraIssue } from '@/lib/csv-parser';

const COMPONENT_SEPARATOR = /[,;]/;

/** Shared by import-service.ts (populating issues.components) and this file's own accumulation. */
export function splitComponents(value: string): string[] {
  return value
    .split(COMPONENT_SEPARATOR)
    .map((component) => component.trim())
    .filter(Boolean);
}

/**
 * Stores each project/component pair once and preserves older catalog records.
 * Existing status is deliberately retained so an administrator can mark a
 * component inactive without a later import changing that decision.
 */
export async function accumulateProjectComponents(client: PoolClient, issues: RawJiraIssue[]): Promise<void> {
  const pairs = new Set<string>();

  for (const issue of issues) {
    const projectKey = issue.projectKey.trim();
    if (!projectKey) continue;
    for (const component of splitComponents(issue.components)) {
      pairs.add(`${projectKey}\u0000${component}`);
    }
  }

  for (const pair of pairs) {
    const [projectKey, componentName] = pair.split('\u0000');
    await client.query(`
      INSERT INTO project_components (project_key, component_name)
      VALUES ($1, $2)
      ON CONFLICT (project_key, component_name)
      DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
    `, [projectKey, componentName]);
  }
}
