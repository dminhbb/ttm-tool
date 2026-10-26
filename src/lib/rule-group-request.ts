import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth-service';
import { emptyConditions, RULE_GROUP_DATE_FIELD_ORDER } from '@/lib/rule-group-config';
import type { RuleGroupDraft } from '@/lib/rule-group-config';
import { RuleGroupSaveError } from '@/lib/rule-group-service';

/** Shared by the /api/rule-groups routes: body → RuleGroupDraft[] (shape only — validateRuleGroups judges content). */
export function parseRuleGroupDrafts(value: unknown): RuleGroupDraft[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const drafts: RuleGroupDraft[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    const id = record.id === null || record.id === undefined ? null : Number(record.id);
    if (id !== null && !Number.isInteger(id)) return null;
    if (typeof record.name !== 'string' || typeof record.key !== 'string') return null;
    if (!Array.isArray(record.ruleIds) || !record.ruleIds.every((ruleId) => typeof ruleId === 'string')) return null;
    const rawOff = record.offRuleIds ?? [];
    if (!Array.isArray(rawOff) || !rawOff.every((ruleId) => typeof ruleId === 'string')) return null;
    const conditions = emptyConditions();
    const rawConditions = (typeof record.conditions === 'object' && record.conditions !== null ? record.conditions : {}) as Record<string, unknown>;
    for (const field of RULE_GROUP_DATE_FIELD_ORDER) {
      const range = rawConditions[field] as { from?: unknown; to?: unknown } | undefined;
      const read = (raw: unknown) => (typeof raw === 'string' && raw.trim() ? raw.trim() : null);
      conditions[field] = { from: read(range?.from), to: read(range?.to) };
    }
    drafts.push({ key: record.key, id, name: record.name, isDefault: record.isDefault === true, enabled: record.enabled !== false, conditions, ruleIds: record.ruleIds as string[], offRuleIds: rawOff as string[], ttmApplied: record.ttmApplied === 'EXCEPTION' || record.ttmApplied === 'STANDARD' ? record.ttmApplied : null });
  }
  return drafts;
}

export function ruleGroupErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được quản lý nhóm rule.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  if (error instanceof RuleGroupSaveError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
