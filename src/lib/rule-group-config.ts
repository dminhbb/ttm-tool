import type { RuleCatalogItem } from '@/lib/scoring/rule-catalog';
import { RULE_SLOT_LABELS } from '@/lib/scoring/rule-labels';
import type { RuleSlot } from '@/lib/scoring/rules/rule-types';
import type { RuleGroupDateField, RuleGroupDateRange, ScoringRuleGroup } from '@/lib/scoring/types';

/**
 * Rule Management (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §6, §10) — the configuration as the
 * screen edits it and the API saves it, plus the checks of §6.3. Client-safe: no database, no rule code (the rules
 * arrive as RuleCatalogItem data).
 */

export const RULE_GROUP_DATE_FIELD_ORDER: readonly RuleGroupDateField[] = ['jiraCreatedAt', 'ideaApprovedDate', 'startDate', 'r4gDate', 'dueDate'];

export const RULE_GROUP_DATE_FIELD_LABELS: Record<RuleGroupDateField, string> = {
  jiraCreatedAt: 'Ngày tạo',
  ideaApprovedDate: 'Ngày phê duyệt ý tưởng',
  startDate: 'Start Date',
  r4gDate: 'R4G Date',
  dueDate: 'Due Date',
};

export const DEFAULT_RULE_GROUP_NAME = 'Default';

/** One group as edited: list order = priority (index 0 = 1), the default group last. */
export interface RuleGroupDraft {
  /** Stable key on the screen (stored id as text, or a temporary key for a new group). */
  key: string;
  /** Stored id; null for a group not saved yet. */
  id: number | null;
  name: string;
  isDefault: boolean;
  enabled: boolean;
  conditions: Record<RuleGroupDateField, RuleGroupDateRange>;
  /** Rules this group turns ON. A rule in neither list is "Kế thừa" (inherited from the next matching group). */
  ruleIds: string[];
  /** Rules this group turns OFF for its Epics, even if a lower group or Default turns them on. Empty for Default. */
  offRuleIds: string[];
  /** Also filter on the Epic's "TTM-applied" (null = any). */
  ttmApplied: TtmAppliedCondition;
}

export type TtmAppliedCondition = 'EXCEPTION' | 'STANDARD' | null;

export const TTM_APPLIED_LABELS: Record<'EXCEPTION' | 'STANDARD', string> = {
  EXCEPTION: 'Ngoại lệ',
  STANDARD: 'Theo quy định (trống / None / giá trị khác)',
};

/** A rule's state in one group. */
export type RuleState = 'INHERIT' | 'ON' | 'OFF';

export function ruleStateOf(group: Pick<RuleGroupDraft, 'ruleIds' | 'offRuleIds'>, ruleId: string): RuleState {
  if (group.ruleIds.includes(ruleId)) return 'ON';
  return (group.offRuleIds ?? []).includes(ruleId) ? 'OFF' : 'INHERIT';
}

export interface RuleGroupConfigResponse {
  groups: RuleGroupDraft[];
  /** Id of the newest history row (0 = never saved) — a save must start from it. */
  version: number;
  savedAt: string | null;
  savedByName: string | null;
  /** Selectable rules first, then the rules that always run. */
  catalog: RuleCatalogItem[];
  /** Keys of the "Bộ ngân sách" that exist (ttm_policy_sets); a rule reading another one has no budgets of its own. */
  policySetKeys: string[];
}

export interface RuleGroupIssue {
  /** null = about the configuration as a whole. */
  groupKey: string | null;
  message: string;
}

export interface RuleGroupValidation {
  errors: RuleGroupIssue[];
  warnings: RuleGroupIssue[];
}

export function emptyConditions(): Record<RuleGroupDateField, RuleGroupDateRange> {
  return {
    jiraCreatedAt: { from: null, to: null },
    ideaApprovedDate: { from: null, to: null },
    startDate: { from: null, to: null },
    r4gDate: { from: null, to: null },
    dueDate: { from: null, to: null },
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function hasAnyCondition(group: RuleGroupDraft): boolean {
  return Boolean(group.ttmApplied) || RULE_GROUP_DATE_FIELD_ORDER.some((field) => group.conditions[field]?.from || group.conditions[field]?.to);
}

/**
 * §6.3. `storedRuleIds` (group id → rule ids saved before) lets a group keep a deprecated rule it already had while
 * refusing it as a new pick. Errors block the save; warnings are shown next to the group.
 */
export function validateRuleGroups(groups: readonly RuleGroupDraft[], catalog: readonly RuleCatalogItem[], storedRuleIds: ReadonlyMap<number, ReadonlySet<string>> = new Map(), policySetKeys?: ReadonlySet<string>): RuleGroupValidation {
  const errors: RuleGroupIssue[] = [];
  const warnings: RuleGroupIssue[] = [];
  const byId = new Map(catalog.map((rule) => [rule.id, rule]));

  const defaults = groups.filter((group) => group.isDefault);
  if (defaults.length !== 1) errors.push({ groupKey: null, message: 'Phải có đúng một nhóm Default.' });
  else if (groups[groups.length - 1] !== defaults[0]) errors.push({ groupKey: defaults[0].key, message: 'Nhóm Default phải có mức ưu tiên thấp nhất (đứng cuối).' });

  const seenNames = new Map<string, string>();
  for (const group of groups) {
    const name = group.name.trim();
    const normalized = name.toLocaleLowerCase('vi-VN');
    if (!name) errors.push({ groupKey: group.key, message: 'Tên nhóm không được để trống.' });
    else if (group.isDefault && name !== DEFAULT_RULE_GROUP_NAME) errors.push({ groupKey: group.key, message: 'Không được đổi tên nhóm Default.' });
    else if (!group.isDefault && normalized === DEFAULT_RULE_GROUP_NAME.toLocaleLowerCase('vi-VN')) errors.push({ groupKey: group.key, message: 'Tên "Default" dành riêng cho nhóm mặc định.' });
    else if (seenNames.has(normalized)) errors.push({ groupKey: group.key, message: `Tên nhóm "${name}" bị trùng.` });
    if (name) seenNames.set(normalized, group.key);
    if (name.length > 100) errors.push({ groupKey: group.key, message: 'Tên nhóm tối đa 100 ký tự.' });

    if (group.isDefault) {
      if (group.ttmApplied) errors.push({ groupKey: group.key, message: 'Nhóm Default không có điều kiện TTM-applied.' });
      if (!group.enabled) errors.push({ groupKey: group.key, message: 'Không được tắt nhóm Default.' });
      if (hasAnyCondition(group)) errors.push({ groupKey: group.key, message: 'Nhóm Default không có điều kiện ngày.' });
    }

    for (const field of RULE_GROUP_DATE_FIELD_ORDER) {
      const range = group.conditions[field] ?? { from: null, to: null };
      for (const value of [range.from, range.to]) {
        if (value && !ISO_DATE.test(value)) errors.push({ groupKey: group.key, message: `${RULE_GROUP_DATE_FIELD_LABELS[field]}: ngày "${value}" không hợp lệ.` });
      }
      if (range.from && range.to && range.from > range.to) errors.push({ groupKey: group.key, message: `${RULE_GROUP_DATE_FIELD_LABELS[field]}: "Từ ngày" phải trước hoặc bằng "Đến ngày".` });
    }

    const offIds = group.offRuleIds ?? [];
    const selected = group.ruleIds.map((id) => byId.get(id)).filter((rule): rule is RuleCatalogItem => Boolean(rule));
    const off = offIds.map((id) => byId.get(id)).filter((rule): rule is RuleCatalogItem => Boolean(rule));
    const unknown = [...group.ruleIds, ...offIds].filter((id) => !byId.has(id));
    for (const rule of off) {
      if (group.ruleIds.includes(rule.id)) errors.push({ groupKey: group.key, message: `"${rule.name}" không thể vừa Bật vừa Tắt.` });
      if (rule.core) errors.push({ groupKey: group.key, message: `"${rule.name}" là rule luôn chạy, không tắt được trong nhóm.` });
    }
    if (group.isDefault && offIds.length) errors.push({ groupKey: group.key, message: 'Nhóm Default không có trạng thái Tắt — rule không bật thì không áp dụng.' });
    if (unknown.length) warnings.push({ groupKey: group.key, message: `Rule không còn tồn tại trong ứng dụng (sẽ bị gỡ khi lưu): ${unknown.join(', ')}.` });
    for (const rule of selected) {
      if (rule.core) errors.push({ groupKey: group.key, message: `"${rule.name}" là rule luôn chạy, không chọn trong nhóm.` });
      const stored = group.id !== null ? storedRuleIds.get(group.id) : undefined;
      if (rule.lifecycle === 'deprecated' && !stored?.has(rule.id)) errors.push({ groupKey: group.key, message: `"${rule.name}" đã ngừng dùng, không chọn mới được.` });
    }
    if (policySetKeys) {
      for (const rule of selected) {
        if (rule.policySet && !policySetKeys.has(rule.policySet)) warnings.push({ groupKey: group.key, message: `"${rule.name}" đọc bộ ngân sách "${rule.policySet}" nhưng bộ này chưa tồn tại — Epic dùng ngân sách Mặc định. Tạo bộ ở Cấu hình cảnh báo → Tiêu chí Time to Market.` });
      }
    }
    const slots = new Map<RuleSlot, RuleCatalogItem[]>();
    for (const rule of selected) if (rule.slot) slots.set(rule.slot, [...(slots.get(rule.slot) ?? []), rule]);
    for (const [slot, rules] of slots) {
      if (rules.length > 1) errors.push({ groupKey: group.key, message: `Chỉ được bật một rule cho "${RULE_SLOT_LABELS[slot]}": ${rules.map((rule) => rule.name).join(', ')}.` });
    }
    for (const rule of off) {
      if (rule.slot && slots.has(rule.slot) && !group.ruleIds.includes(rule.id)) errors.push({ groupKey: group.key, message: `"${RULE_SLOT_LABELS[rule.slot]}" vừa có rule Bật vừa có rule Tắt trong cùng nhóm.` });
    }

    if (group.isDefault) {
      // Default is the last layer: what it does not turn on does not apply.
      if (!slots.has('TTM_CNTT_VERDICT')) warnings.push({ groupKey: group.key, message: 'Không có rule TTM-CNTT: Epic không có nhóm nào bật rule này bị loại ở L02, không tính TTM-CNTT (QLDA) và (QA).' });
      if (!slots.has('TTM_E2E_VERDICT')) warnings.push({ groupKey: group.key, message: 'Không có rule TTM-E2E: Epic không có nhóm nào bật rule này không tính vào TTM-E2E.' });
      for (const rule of selected) {
        const missing = rule.requires.filter((slot) => !slots.has(slot));
        if (missing.length) warnings.push({ groupKey: group.key, message: `"${rule.name}" cần một rule TTM-CNTT đang bật để có tác dụng.` });
      }
    } else {
      if (off.some((rule) => rule.slot === 'TTM_CNTT_VERDICT')) warnings.push({ groupKey: group.key, message: 'Tắt rule TTM-CNTT: Epic của nhóm bị loại ở L02, không tính TTM-CNTT (QLDA) và (QA).' });
      if (off.some((rule) => rule.slot === 'TTM_E2E_VERDICT')) warnings.push({ groupKey: group.key, message: 'Tắt rule TTM-E2E: Epic của nhóm không tính vào TTM-E2E.' });
      if (group.enabled && selected.length + off.length === 0) warnings.push({ groupKey: group.key, message: 'Nhóm chưa khai báo rule nào (tất cả Kế thừa) nên chưa có tác dụng.' });
      if (group.enabled && !hasAnyCondition(group) && selected.length + off.length > 0) {
        warnings.push({ groupKey: group.key, message: 'Nhóm không có điều kiện ngày nào nên áp dụng cho mọi Epic — các rule nhóm khai báo thay thế Default cho toàn bộ Epic.' });
      }
    }
  }
  return { errors, warnings };
}

/** Two groups that can both match one Epic and declare different things for the same slot. */
export interface RuleGroupConflict {
  slot: RuleSlot;
  /** The higher-priority group — it wins for an Epic matching both. */
  higherKey: string;
  lowerKey: string;
  message: string;
}

function rangesIntersect(a: RuleGroupDateRange | undefined, b: RuleGroupDateRange | undefined): boolean {
  const from = [a?.from, b?.from].filter((value): value is string => Boolean(value)).sort().pop();
  const to = [a?.to, b?.to].filter((value): value is string => Boolean(value)).sort()[0];
  return !from || !to || from <= to;
}

/** Some Epic could meet the date conditions of both groups (every date range intersects; an open end is unbounded). */
export function groupsMayOverlap(a: Pick<RuleGroupDraft, 'conditions' | 'ttmApplied'>, b: Pick<RuleGroupDraft, 'conditions' | 'ttmApplied'>): boolean {
  if (a.ttmApplied && b.ttmApplied && a.ttmApplied !== b.ttmApplied) return false;
  return RULE_GROUP_DATE_FIELD_ORDER.every((field) => rangesIntersect(a.conditions[field], b.conditions[field]));
}

/**
 * Before a save (owner decision 2026-10-26): enabled non-default groups that may match the same Epic and both name a
 * slot with a different outcome (another rule ON, or ON against OFF). The Epic follows the higher-priority group, so
 * it is not an error — the screen asks the user to confirm. Default is never in conflict: overriding it is the point.
 */
export function detectRuleGroupConflicts(groups: readonly RuleGroupDraft[], catalog: readonly RuleCatalogItem[]): RuleGroupConflict[] {
  const byId = new Map(catalog.map((rule) => [rule.id, rule]));
  const decisionOf = (group: RuleGroupDraft, slot: RuleSlot): { text: string; value: string } | null => {
    const on = group.ruleIds.map((id) => byId.get(id)).find((rule) => rule?.slot === slot);
    if (on) return { text: `Bật "${on.name}"`, value: on.id };
    if ((group.offRuleIds ?? []).some((id) => byId.get(id)?.slot === slot)) return { text: 'Tắt', value: 'OFF' };
    return null;
  };
  const active = groups.map((group, index) => ({ group, index })).filter(({ group }) => !group.isDefault && group.enabled);
  const slots = [...new Set(catalog.flatMap((rule) => (rule.slot && !rule.core ? [rule.slot] : [])))];
  const conflicts: RuleGroupConflict[] = [];
  for (const [position, high] of active.entries()) {
    for (const low of active.slice(position + 1)) {
      if (!groupsMayOverlap(high.group, low.group)) continue;
      for (const slot of slots) {
        const a = decisionOf(high.group, slot);
        const b = decisionOf(low.group, slot);
        if (!a || !b || a.value === b.value) continue;
        const label = (item: typeof high) => `"${item.group.name.trim() || '(chưa đặt tên)'}" (#${item.index + 1})`;
        conflicts.push({
          slot,
          higherKey: high.group.key,
          lowerKey: low.group.key,
          message: `${label(high)} và ${label(low)} có thể cùng khớp một Epic nhưng khai báo khác nhau cho "${RULE_SLOT_LABELS[slot]}": ${label(high)} ${a.text}, ${label(low)} ${b.text}. Epic khớp cả hai sẽ theo ${label(high)} (ưu tiên cao hơn).`,
        });
      }
    }
  }
  return conflicts;
}

/** Drafts → the groups the Scoring Service reads; a new group gets a temporary negative id (preview only). */
export function draftsToScoringRuleGroups(groups: readonly RuleGroupDraft[]): ScoringRuleGroup[] {
  let temporaryId = 0;
  return groups.map((group, index) => ({
    id: group.id ?? --temporaryId,
    name: group.name.trim(),
    priority: group.isDefault ? 0 : index + 1,
    isDefault: group.isDefault,
    enabled: group.isDefault || group.enabled,
    conditions: Object.fromEntries(RULE_GROUP_DATE_FIELD_ORDER.flatMap((field) => {
      const range = group.conditions[field];
      return range && (range.from || range.to) ? [[field, { from: range.from || null, to: range.to || null }]] : [];
    })),
    ruleIds: [...group.ruleIds],
    offRuleIds: group.isDefault ? [] : [...(group.offRuleIds ?? [])],
    ttmApplied: group.isDefault ? null : group.ttmApplied ?? null,
  }));
}

/** Short Vietnamese description of a group's date conditions, e.g. "Start Date ≥ 01/09/2026; R4G Date ≤ 31/12/2026". */
export function describeConditions(conditions: Partial<Record<RuleGroupDateField, RuleGroupDateRange>>, ttmApplied?: TtmAppliedCondition): string {
  const format = (iso: string) => iso.split('-').reverse().join('/');
  const parts = RULE_GROUP_DATE_FIELD_ORDER.flatMap((field) => {
    const range = conditions[field];
    if (!range || (!range.from && !range.to)) return [];
    const label = RULE_GROUP_DATE_FIELD_LABELS[field];
    if (range.from && range.to) return [`${format(range.from)} ≤ ${label} ≤ ${format(range.to)}`];
    return [range.from ? `${label} ≥ ${format(range.from)}` : `${label} ≤ ${format(range.to!)}`];
  });
  if (ttmApplied) parts.push(`TTM-applied = ${ttmApplied === 'EXCEPTION' ? 'Ngoại lệ' : 'Theo quy định'}`);
  return parts.length ? parts.join('; ') : 'Không có điều kiện ngày';
}

/** Preview of a draft against the saved configuration (POST /api/rule-groups/preview). */
export interface RuleGroupPreviewTotals {
  ttmPass: number;
  ttmFail: number;
  qaPass: number;
  qaFail: number;
  e2ePass: number;
  e2eFail: number;
  dataAnomaly: number;
}

export interface RuleGroupPreviewResponse {
  asOf: string;
  epicCount: number;
  /** Epics per draft group key (excluded Epics — "Epic ngoại lệ" — are in no group). */
  matchedByGroupKey: Record<string, number>;
  excludedCount: number;
  current: RuleGroupPreviewTotals;
  draft: RuleGroupPreviewTotals;
  /** Epics whose active badges differ between the saved and the draft configuration. */
  changedEpicCount: number;
}

export interface RuleGroupHistoryEntry {
  id: number;
  savedAt: string;
  savedByName: string | null;
  ruleCodeVersion: string;
  before: RuleGroupDraft[];
  after: RuleGroupDraft[];
}

/** One Rule Group as the "Logic cảnh báo" popup lists it (GET /api/rule-group-summary, every signed-in user). */
export interface RuleGroupSummaryItem {
  name: string;
  isDefault: boolean;
  enabled: boolean;
  /** 1 = highest; the default group comes last (null). */
  priority: number | null;
  conditions: string;
  ruleIds: string[];
  offRuleIds: string[];
}
