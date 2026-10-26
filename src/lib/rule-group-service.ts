import 'server-only';
import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import {
  DEFAULT_RULE_GROUP_NAME,
  emptyConditions,
  RULE_GROUP_DATE_FIELD_ORDER,
  validateRuleGroups,
} from '@/lib/rule-group-config';
import type {
  RuleGroupConfigResponse,
  RuleGroupDraft,
  RuleGroupHistoryEntry,
} from '@/lib/rule-group-config';
import { SCORING_CODE_VERSION } from '@/lib/scoring/registry';
import { buildRuleCatalog } from '@/lib/scoring/rule-catalog';
import type { RuleGroupDateField, ScoringRuleGroup } from '@/lib/scoring/types';

/**
 * Rule Groups in the database (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §9–10): tables
 * scoring_rule_groups / scoring_rule_group_rules / scoring_rule_group_history (migration 20261028).
 */

/** DB column prefix of each date condition. */
const DATE_COLUMNS: Record<RuleGroupDateField, string> = {
  jiraCreatedAt: 'created',
  ideaApprovedDate: 'idea_approved',
  startDate: 'start',
  r4gDate: 'r4g',
  dueDate: 'due',
};

/** Arbitrary constant key for pg_advisory_xact_lock — serializes saves of the Rule Group configuration. */
const RULE_GROUP_SAVE_LOCK_KEY = 7_261_028;

interface RuleGroupRow {
  id: number;
  name: string;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  ruleIds: string[];
  offRuleIds: string[];
  ttmApplied: 'EXCEPTION' | 'STANDARD' | null;
  [column: string]: unknown;
}

type Queryable = Pick<PoolClient, 'query'>;

const SELECT_GROUPS_SQL = `
  SELECT g.id, g.name, g.priority, g.is_default AS "isDefault", g.enabled, g.ttm_applied AS "ttmApplied",
         ${RULE_GROUP_DATE_FIELD_ORDER.map((field) => `g.${DATE_COLUMNS[field]}_from::text AS "${field}From", g.${DATE_COLUMNS[field]}_to::text AS "${field}To"`).join(', ')},
         COALESCE(array_agg(r.rule_id ORDER BY r.rule_id) FILTER (WHERE r.state = 'ON'), '{}') AS "ruleIds",
         COALESCE(array_agg(r.rule_id ORDER BY r.rule_id) FILTER (WHERE r.state = 'OFF'), '{}') AS "offRuleIds"
  FROM scoring_rule_groups g
  LEFT JOIN scoring_rule_group_rules r ON r.group_id = g.id
  GROUP BY g.id
  ORDER BY g.is_default ASC, g.priority ASC, g.id ASC;
`;

function isMissingTable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '42P01';
}

function rowToGroup(row: RuleGroupRow): ScoringRuleGroup {
  const conditions: ScoringRuleGroup['conditions'] = {};
  for (const field of RULE_GROUP_DATE_FIELD_ORDER) {
    const from = (row[`${field}From`] as string | null) ?? null;
    const to = (row[`${field}To`] as string | null) ?? null;
    if (from || to) conditions[field] = { from, to };
  }
  return { id: row.id, name: row.name, priority: row.priority, isDefault: row.isDefault, enabled: row.isDefault || row.enabled, conditions, ruleIds: row.ruleIds, offRuleIds: row.isDefault ? [] : row.offRuleIds, ttmApplied: row.isDefault ? null : row.ttmApplied };
}

async function queryGroups(db: Queryable): Promise<ScoringRuleGroup[]> {
  const result = await db.query<RuleGroupRow>(SELECT_GROUPS_SQL);
  return result.rows.map(rowToGroup);
}

/**
 * The configured Rule Groups for the Scoring Service (ScoringContext.ruleGroups) — disabled ones included (the
 * resolver skips them). An empty list (tables not migrated on this database yet) means the default group built in
 * code, so scoring never breaks.
 */
export async function loadRuleGroups(): Promise<ScoringRuleGroup[]> {
  try {
    return await queryGroups(pool);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

function groupToDraft(group: ScoringRuleGroup): RuleGroupDraft {
  const conditions = emptyConditions();
  for (const field of RULE_GROUP_DATE_FIELD_ORDER) {
    const range = group.conditions[field];
    if (range) conditions[field] = { from: range.from, to: range.to };
  }
  return { key: String(group.id), id: group.id, name: group.name, isDefault: group.isDefault, enabled: group.enabled, conditions, ruleIds: [...group.ruleIds], offRuleIds: [...(group.offRuleIds ?? [])], ttmApplied: group.ttmApplied ?? null };
}

async function readVersion(db: Queryable): Promise<{ version: number; savedAt: string | null; savedByName: string | null }> {
  const result = await db.query<{ id: number; savedAt: string; savedByName: string | null }>(`
    SELECT h.id, h.saved_at::text AS "savedAt", u.full_name AS "savedByName"
    FROM scoring_rule_group_history h
    LEFT JOIN users u ON u.id = h.saved_by_user_id
    ORDER BY h.id DESC LIMIT 1;
  `);
  const row = result.rows[0];
  return { version: row?.id ?? 0, savedAt: row?.savedAt ?? null, savedByName: row?.savedByName ?? null };
}

export async function readRuleGroupDrafts(db: Queryable): Promise<RuleGroupDraft[]> {
  return (await queryGroups(db)).map(groupToDraft);
}

export async function getRuleGroupConfig(): Promise<RuleGroupConfigResponse> {
  const [groups, version, policySetKeys] = await Promise.all([readRuleGroupDrafts(pool), readVersion(pool), readPolicySetKeys()]);
  return { groups, ...version, catalog: buildRuleCatalog(), policySetKeys };
}

async function readPolicySetKeys(): Promise<string[]> {
  try {
    return (await pool.query<{ key: string }>('SELECT key FROM ttm_policy_sets ORDER BY key;')).rows.map((row) => row.key);
  } catch (error) {
    if (isMissingTable(error)) return ['DEFAULT']; // migration 20261031 not applied yet
    throw error;
  }
}

export class RuleGroupSaveError extends Error {
  readonly status: 400 | 409;
  readonly details: string[];

  constructor(status: 400 | 409, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Trims names, drops ids the code no longer has (§5.3) and keeps rule ids unique and sorted. */
export function cleanRuleGroupDrafts(groups: readonly RuleGroupDraft[]): RuleGroupDraft[] {
  const known = new Set(buildRuleCatalog().map((rule) => rule.id));
  return groups.map((group) => ({
    ...group,
    name: group.isDefault ? DEFAULT_RULE_GROUP_NAME : group.name.trim(),
    enabled: group.isDefault ? true : group.enabled,
    ttmApplied: group.isDefault ? null : group.ttmApplied === 'EXCEPTION' || group.ttmApplied === 'STANDARD' ? group.ttmApplied : null,
    conditions: Object.fromEntries(RULE_GROUP_DATE_FIELD_ORDER.map((field) => {
      const range = group.conditions?.[field];
      return [field, { from: range?.from || null, to: range?.to || null }];
    })) as RuleGroupDraft['conditions'],
    ruleIds: [...new Set(group.ruleIds.filter((id) => known.has(id)))].sort(),
    // Default has no group below it to override: a rule it does not turn ON simply does not apply.
    offRuleIds: group.isDefault ? [] : [...new Set(group.offRuleIds.filter((id) => known.has(id) && !group.ruleIds.includes(id)))].sort(),
  }));
}

export function assertValidRuleGroups(groups: readonly RuleGroupDraft[], stored: readonly RuleGroupDraft[]): void {
  const storedRuleIds = new Map(stored.flatMap((group) => (group.id === null ? [] : [[group.id, new Set([...group.ruleIds, ...(group.offRuleIds ?? [])])] as const])));
  const { errors } = validateRuleGroups(groups, buildRuleCatalog(), storedRuleIds);
  if (errors.length) throw new RuleGroupSaveError(400, 'Cấu hình nhóm rule chưa hợp lệ.', errors.map((issue) => issue.message));
}

/**
 * Saves the whole configuration in one transaction (§10.2): only from the version the screen loaded (else 409), the
 * default group keeps its row (only its rules change), groups left out are deleted, priority = list order. Writes one
 * scoring_rule_group_history row (before / after).
 */
export async function saveRuleGroupConfig(input: readonly RuleGroupDraft[], baseVersion: number, userId: number, options: { dryRun?: boolean } = {}): Promise<RuleGroupConfigResponse> {
  const groups = cleanRuleGroupDrafts(input);
  const client = await getClient();
  let dryRunResult: RuleGroupDraft[] | null = null;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [RULE_GROUP_SAVE_LOCK_KEY]);
    const { version } = await readVersion(client);
    if (version !== baseVersion) throw new RuleGroupSaveError(409, 'Cấu hình nhóm rule vừa được người khác lưu. Hãy tải lại trang để xem bản mới nhất trước khi lưu.');
    const before = await readRuleGroupDrafts(client);
    assertValidRuleGroups(groups, before);

    const storedDefault = before.find((group) => group.isDefault);
    const inputDefault = groups.find((group) => group.isDefault)!;
    if (!storedDefault || inputDefault.id !== storedDefault.id) throw new RuleGroupSaveError(400, 'Nhóm Default không khớp với dữ liệu đã lưu. Hãy tải lại trang.');
    const storedIds = new Set(before.map((group) => group.id));
    for (const group of groups) {
      if (group.id !== null && !storedIds.has(group.id)) throw new RuleGroupSaveError(409, `Nhóm "${group.name}" không còn tồn tại. Hãy tải lại trang.`);
    }

    const keptIds = groups.flatMap((group) => (group.id !== null && !group.isDefault ? [group.id] : []));
    await client.query('DELETE FROM scoring_rule_groups WHERE NOT is_default AND NOT (id = ANY($1::int[]));', [keptIds]);
    // Free the names first so swapping two names can't trip the unique index half-way.
    await client.query(`UPDATE scoring_rule_groups SET name = '~' || id WHERE id = ANY($1::int[]);`, [keptIds]);

    const dateColumns = RULE_GROUP_DATE_FIELD_ORDER.flatMap((field) => [`${DATE_COLUMNS[field]}_from`, `${DATE_COLUMNS[field]}_to`]);
    const finalIds: number[] = [];
    for (const [index, group] of groups.entries()) {
      if (group.isDefault) {
        await client.query('UPDATE scoring_rule_groups SET updated_at = NOW(), updated_by_user_id = $2 WHERE id = $1;', [group.id, userId]);
        finalIds.push(group.id!);
        continue;
      }
      const dates = RULE_GROUP_DATE_FIELD_ORDER.flatMap((field) => [group.conditions[field].from, group.conditions[field].to]);
      const values = [group.name, index + 1, group.enabled, ...dates, userId, group.ttmApplied ?? null];
      if (group.id !== null) {
        await client.query(
          `UPDATE scoring_rule_groups SET name = $1, priority = $2, enabled = $3, ${dateColumns.map((column, i) => `${column} = $${i + 4}::date`).join(', ')},
             updated_at = NOW(), updated_by_user_id = $${dateColumns.length + 4}, ttm_applied = $${dateColumns.length + 5} WHERE id = $${dateColumns.length + 6} AND NOT is_default;`,
          [...values, group.id],
        );
        finalIds.push(group.id);
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO scoring_rule_groups (name, priority, enabled, ${dateColumns.join(', ')}, updated_by_user_id, ttm_applied)
           VALUES ($1, $2, $3, ${dateColumns.map((_, i) => `$${i + 4}::date`).join(', ')}, $${dateColumns.length + 4}, $${dateColumns.length + 5}) RETURNING id;`,
          values,
        );
        finalIds.push(inserted.rows[0].id);
      }
    }

    await client.query('DELETE FROM scoring_rule_group_rules WHERE group_id = ANY($1::int[]);', [finalIds]);
    const rows = groups.flatMap((group, index) => [
      ...group.ruleIds.map((ruleId) => [finalIds[index], ruleId, 'ON'] as const),
      ...group.offRuleIds.map((ruleId) => [finalIds[index], ruleId, 'OFF'] as const),
    ]);
    if (rows.length) {
      await client.query(
        'INSERT INTO scoring_rule_group_rules (group_id, rule_id, state) SELECT * FROM unnest($1::int[], $2::text[], $3::text[]);',
        [rows.map(([id]) => id), rows.map(([, ruleId]) => ruleId), rows.map(([, , state]) => state)],
      );
    }

    const after = await readRuleGroupDrafts(client);
    await client.query(
      'INSERT INTO scoring_rule_group_history (saved_by_user_id, config_before, config_after, rule_code_version) VALUES ($1, $2::jsonb, $3::jsonb, $4);',
      [userId, JSON.stringify(before), JSON.stringify(after), SCORING_CODE_VERSION],
    );
    if (options.dryRun) {
      // Checks every statement against the real schema, then leaves the database untouched.
      dryRunResult = after;
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (dryRunResult) return { ...(await getRuleGroupConfig()), groups: dryRunResult };
  return getRuleGroupConfig();
}

export async function listRuleGroupHistory(limit = 30): Promise<RuleGroupHistoryEntry[]> {
  const result = await pool.query<{ id: number; savedAt: string; savedByName: string | null; ruleCodeVersion: string; before: RuleGroupDraft[]; after: RuleGroupDraft[] }>(`
    SELECT h.id, h.saved_at::text AS "savedAt", u.full_name AS "savedByName", h.rule_code_version AS "ruleCodeVersion",
           h.config_before AS before, h.config_after AS after
    FROM scoring_rule_group_history h
    LEFT JOIN users u ON u.id = h.saved_by_user_id
    ORDER BY h.id DESC
    LIMIT $1;
  `, [limit]);
  return result.rows;
}
