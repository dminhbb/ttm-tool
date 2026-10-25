'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  CaretDown,
  ClockCounterClockwise,
  Eye,
  FloppyDisk,
  Plus,
  Question,
  Trash,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { BooleanPillToggle } from '@/components/ui/PillToggle';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialogs';
import {
  describeConditions,
  emptyConditions,
  RULE_GROUP_DATE_FIELD_LABELS,
  RULE_GROUP_DATE_FIELD_ORDER,
  validateRuleGroups,
} from '@/lib/rule-group-config';
import type {
  RuleGroupConfigResponse,
  RuleGroupDraft,
  RuleGroupHistoryEntry,
  RuleGroupIssue,
  RuleGroupPreviewResponse,
  RuleGroupPreviewTotals,
} from '@/lib/rule-group-config';
import { FINDING_GROUPS } from '@/lib/scoring/catalog';
import type { RuleCatalogItem } from '@/lib/scoring/rule-catalog';
import { RULE_CATEGORY_LABELS, RULE_CATEGORY_ORDER, RULE_SLOT_LABELS } from '@/lib/scoring/rule-labels';
import type { RuleSlot } from '@/lib/scoring/rules/rule-types';
import type { RuleGroupDateField } from '@/lib/scoring/types';

/**
 * Rule Management (spec docs/superpowers/specs/2026-10-25-rule-groups-design.md §10): the Rule Groups of the Epic
 * Scoring Service — each a range of Epics by date + the rules that judge them, in priority order, the Default group
 * last. The whole configuration is edited as a draft and saved in one go.
 */

const SLOTS: readonly RuleSlot[] = ['TTM_CNTT_VERDICT', 'TTM_E2E_VERDICT'];
const FINDING_GROUP_LABEL = Object.fromEntries(FINDING_GROUPS.map((group) => [group.id, group.label]));
const DATE_INPUT_CLASS = 'h-8 w-[132px] rounded border border-fb-border bg-fb-surface px-2 text-xs text-fb-text-primary focus:outline-none focus:ring-1 focus:ring-status-success disabled:opacity-50';
const ICON_BUTTON_CLASS = 'inline-flex size-8 items-center justify-center rounded-md border border-fb-border text-fb-text-secondary transition-colors hover:bg-fb-surface-muted hover:text-fb-text-primary disabled:pointer-events-none disabled:opacity-30';

interface ErrorPayload {
  error?: string;
  details?: string[];
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { error, details } = payload as ErrorPayload;
    throw new Error([error ?? fallback, ...(details ?? [])].join('\n'));
  }
  return payload as T;
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('vi-VN') : '';
}

function formatNumber(value: number): string {
  return value.toLocaleString('vi-VN');
}

function passPct(pass: number, fail: number): string {
  return pass + fail > 0 ? `${((pass / (pass + fail)) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%` : '—';
}

function newGroupKey(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** What changed between two saved configurations — one line per change, for "Lịch sử thay đổi". */
function describeHistory(entry: RuleGroupHistoryEntry, ruleNames: ReadonlyMap<string, string>): string[] {
  const lines: string[] = [];
  const beforeById = new Map(entry.before.map((group) => [group.id, group]));
  const afterById = new Map(entry.after.map((group) => [group.id, group]));
  const name = (id: string) => ruleNames.get(id) ?? id;
  for (const group of entry.after) {
    const old = beforeById.get(group.id);
    if (!old) {
      lines.push(`Thêm nhóm "${group.name}" (${describeConditions(group.conditions)}).`);
      continue;
    }
    if (old.name !== group.name) lines.push(`Đổi tên "${old.name}" → "${group.name}".`);
    if (old.enabled !== group.enabled) lines.push(`${group.enabled ? 'Bật' : 'Tắt'} nhóm "${group.name}".`);
    if (describeConditions(old.conditions) !== describeConditions(group.conditions)) lines.push(`"${group.name}": điều kiện ${describeConditions(old.conditions)} → ${describeConditions(group.conditions)}.`);
    const added = group.ruleIds.filter((id) => !old.ruleIds.includes(id));
    const removed = old.ruleIds.filter((id) => !group.ruleIds.includes(id));
    if (added.length) lines.push(`"${group.name}": thêm rule ${added.map(name).join(', ')}.`);
    if (removed.length) lines.push(`"${group.name}": bỏ rule ${removed.map(name).join(', ')}.`);
  }
  for (const group of entry.before) if (!afterById.has(group.id)) lines.push(`Xoá nhóm "${group.name}".`);
  const order = (groups: RuleGroupDraft[]) => groups.map((group) => group.id).join(',');
  if (order(entry.before.filter((g) => afterById.has(g.id))) !== order(entry.after.filter((g) => beforeById.has(g.id)))) lines.push('Đổi thứ tự ưu tiên các nhóm.');
  return lines.length ? lines : ['Không có thay đổi nội dung.'];
}

export function RuleManagementSettings() {
  const [config, setConfig] = useState<RuleGroupConfigResponse | null>(null);
  const [drafts, setDrafts] = useState<RuleGroupDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<RuleGroupPreviewResponse | null>(null);
  const [previewedDrafts, setPreviewedDrafts] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [detailRule, setDetailRule] = useState<RuleCatalogItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<RuleGroupHistoryEntry[] | null>(null);

  const catalog = useMemo(() => config?.catalog ?? [], [config]);
  const selectable = useMemo(() => catalog.filter((rule) => !rule.core), [catalog]);
  const coreRules = useMemo(() => catalog.filter((rule) => rule.core), [catalog]);
  const ruleNames = useMemo(() => new Map(catalog.map((rule) => [rule.id, rule.name])), [catalog]);
  const storedRuleIds = useMemo(() => new Map((config?.groups ?? []).flatMap((group) => (group.id === null ? [] : [[group.id, new Set(group.ruleIds)] as const]))), [config]);
  const validation = useMemo(() => validateRuleGroups(drafts, catalog, storedRuleIds), [drafts, catalog, storedRuleIds]);
  const draftsJson = JSON.stringify(drafts);
  const dirty = config !== null && draftsJson !== JSON.stringify(config.groups);
  const previewStale = preview !== null && previewedDrafts !== draftsJson;

  const runPreview = async (groups: RuleGroupDraft[]) => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const response = await fetch('/api/rule-groups/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups }) });
      setPreview(await readJson<RuleGroupPreviewResponse>(response, 'Không thể xem trước tác động.'));
      setPreviewedDrafts(JSON.stringify(groups));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Không thể xem trước tác động.');
    } finally {
      setPreviewing(false);
    }
  };

  const applyConfig = (next: RuleGroupConfigResponse) => {
    setConfig(next);
    setDrafts(next.groups);
    setSaveError(null);
  };

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await readJson<RuleGroupConfigResponse>(await fetch('/api/rule-groups'), 'Không thể tải cấu hình nhóm rule.');
      applyConfig(next);
      void runPreview(next.groups);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải cấu hình nhóm rule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const updateGroup = (key: string, patch: (group: RuleGroupDraft) => RuleGroupDraft) => {
    setDrafts((prev) => prev.map((group) => (group.key === key ? patch(group) : group)));
  };

  const setDate = (key: string, field: RuleGroupDateField, end: 'from' | 'to', value: string) => {
    updateGroup(key, (group) => ({ ...group, conditions: { ...group.conditions, [field]: { ...group.conditions[field], [end]: value || null } } }));
  };

  const toggleRule = (key: string, ruleId: string, on: boolean) => {
    updateGroup(key, (group) => ({ ...group, ruleIds: on ? [...new Set([...group.ruleIds, ruleId])].sort() : group.ruleIds.filter((id) => id !== ruleId) }));
  };

  const setSlotRule = (key: string, slot: RuleSlot, ruleId: string | null) => {
    const slotIds = new Set(selectable.filter((rule) => rule.slot === slot).map((rule) => rule.id));
    updateGroup(key, (group) => ({ ...group, ruleIds: [...group.ruleIds.filter((id) => !slotIds.has(id)), ...(ruleId ? [ruleId] : [])].sort() }));
  };

  const move = (index: number, step: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...prev];
      const target = index + step;
      if (target < 0 || next[target]?.isDefault || next[index]?.isDefault) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addGroup = () => {
    const defaultGroup = drafts.find((group) => group.isDefault);
    const existing = new Set(drafts.map((group) => group.name.trim().toLocaleLowerCase('vi-VN')));
    let index = 1;
    while (existing.has(`nhóm mới ${index}`)) index += 1;
    const group: RuleGroupDraft = { key: newGroupKey(), id: null, name: `Nhóm mới ${index}`, isDefault: false, enabled: true, conditions: emptyConditions(), ruleIds: [...(defaultGroup?.ruleIds ?? [])] };
    setDrafts((prev) => [...prev.filter((item) => !item.isDefault), group, ...prev.filter((item) => item.isDefault)]);
    setExpanded((prev) => new Set([...prev, group.key]));
  };

  const removeGroup = async (group: RuleGroupDraft) => {
    const ok = await confirmDialog({ title: 'Xoá nhóm rule', description: `Xoá nhóm "${group.name}"? Epic của nhóm sẽ chuyển sang nhóm khớp tiếp theo hoặc Default sau khi lưu.`, confirmLabel: 'Xoá' });
    if (ok) setDrafts((prev) => prev.filter((item) => item.key !== group.key));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch('/api/rule-groups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups: drafts, baseVersion: config.version }) });
      const next = await readJson<RuleGroupConfigResponse>(response, 'Không thể lưu cấu hình nhóm rule.');
      applyConfig(next);
      setHistory(null);
      showToast('Đã lưu cấu hình nhóm rule — đang tính toán lại cache, có thể mất vài chục giây.', 6000);
      void runPreview(next.groups);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không thể lưu cấu hình nhóm rule.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    if (history) return;
    try {
      const data = await readJson<{ entries: RuleGroupHistoryEntry[] }>(await fetch('/api/rule-groups/history'), 'Không thể tải lịch sử thay đổi.');
      setHistory(data.entries);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tải lịch sử thay đổi.', 5000);
      setHistoryOpen(false);
    }
  };

  if (loading) return <Card><CardBody><TableSkeleton rows={6} /></CardBody></Card>;
  if (loadError || !config) return <Alert title="Không tải được Rule Management" variant="error"><span className="whitespace-pre-line">{loadError}</span></Alert>;

  const issuesOf = (key: string | null, list: RuleGroupIssue[]) => list.filter((issue) => issue.groupKey === key);
  const globalErrors = issuesOf(null, validation.errors);
  const nonDefaultCount = drafts.filter((group) => !group.isDefault).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Nhóm rule (Rule Group)</CardTitle>
              <p className="mt-1 max-w-3xl text-xs text-fb-text-secondary">
                Mỗi Epic thuộc nhóm <strong>bật</strong> có ưu tiên cao nhất mà nó khớp mọi điều kiện ngày (AND, tính cả hai đầu; ô trống = không giới hạn;
                Epic thiếu ngày đó thì không khớp). Epic không khớp nhóm nào thuộc nhóm <strong>Default</strong>. Lưu xong, toàn bộ Epic được chấm lại — kể cả các lớp dữ liệu quá khứ.
              </p>
              <p className="mt-1 text-xs text-fb-text-secondary">
                {config.savedAt ? `Lưu lần cuối: ${formatDateTime(config.savedAt)}${config.savedByName ? ` bởi ${config.savedByName}` : ''}.` : 'Chưa có lần lưu nào (đang dùng nhóm Default khởi tạo).'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" icon={<Plus className="size-4" />} onClick={addGroup} size="sm">Thêm nhóm</Button>
              <Button variant="outline" icon={<Eye className="size-4" />} isLoading={previewing} onClick={() => void runPreview(drafts)} size="sm" disabled={validation.errors.length > 0}>Xem trước tác động</Button>
              <Button variant="outline" icon={<ClockCounterClockwise className="size-4" />} onClick={() => void openHistory()} size="sm">Lịch sử thay đổi</Button>
              <Button variant="outline" icon={<ArrowCounterClockwise className="size-4" />} onClick={() => { setDrafts(config.groups); setSaveError(null); }} size="sm" disabled={!dirty}>Hoàn tác</Button>
              <Button variant="primary" icon={<FloppyDisk className="size-4" />} isLoading={saving} onClick={() => void save()} size="sm" disabled={!dirty || validation.errors.length > 0}>Lưu</Button>
            </div>
          </div>
        </CardHeader>
        {(saveError || globalErrors.length > 0 || dirty) && (
          <CardBody className="flex flex-col gap-2">
            {dirty && <p className="text-xs font-medium text-status-warning">Có thay đổi chưa lưu.</p>}
            {saveError && <Alert title="Chưa lưu được" variant="error"><span className="whitespace-pre-line">{saveError}</span></Alert>}
            {globalErrors.map((issue) => <Alert key={issue.message} title="Cấu hình chưa hợp lệ" variant="error">{issue.message}</Alert>)}
          </CardBody>
        )}
      </Card>

      <PreviewCard error={previewError} preview={preview} previewing={previewing} stale={previewStale} />

      {drafts.map((group, index) => {
        const errors = issuesOf(group.key, validation.errors);
        const warnings = issuesOf(group.key, validation.warnings);
        const open = expanded.has(group.key);
        const matched = preview && !previewStale ? preview.matchedByGroupKey[group.key] : undefined;
        return (
          <Card key={group.key} className={group.enabled ? '' : 'opacity-80'}>
            <CardHeader className="cursor-pointer select-none transition-colors hover:bg-fb-surface-muted" onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>
              <div className="flex w-full flex-wrap items-center gap-2">
                <CaretDown className={`size-4 shrink-0 text-fb-text-secondary transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                <Badge variant="neutral" className="font-mono text-xs">{group.isDefault ? 'Cuối' : `#${index + 1}`}</Badge>
                <span className="min-w-0 truncate text-sm font-semibold text-fb-text-primary">{group.name || '(chưa đặt tên)'}</span>
                {group.isDefault ? <Badge variant="info">Mặc định · luôn bật</Badge> : <Badge variant={group.enabled ? 'success' : 'neutral'}>{group.enabled ? 'Bật' : 'Tắt'}</Badge>}
                <span className="text-xs text-fb-text-secondary">{group.isDefault ? 'Epic không khớp nhóm nào ở trên' : describeConditions(group.conditions)}</span>
                <span className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  {matched !== undefined && <Badge variant="pending">{formatNumber(matched)} Epic</Badge>}
                  {errors.length > 0 && <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-danger"><XCircle className="size-4" />{errors.length}</span>}
                  {warnings.length > 0 && <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-warning"><Warning className="size-4" />{warnings.length}</span>}
                  <span className="text-xs text-fb-text-secondary">{group.ruleIds.filter((id) => ruleNames.has(id)).length}/{selectable.length} rule</span>
                  {!group.isDefault && (
                    <>
                      <button aria-label="Tăng ưu tiên" className={ICON_BUTTON_CLASS} disabled={index === 0} onClick={() => move(index, -1)} title="Tăng ưu tiên" type="button"><ArrowUp className="size-4" /></button>
                      <button aria-label="Giảm ưu tiên" className={ICON_BUTTON_CLASS} disabled={index >= nonDefaultCount - 1} onClick={() => move(index, 1)} title="Giảm ưu tiên" type="button"><ArrowDown className="size-4" /></button>
                      <button aria-label="Xoá nhóm" className={`${ICON_BUTTON_CLASS} hover:text-status-danger`} onClick={() => void removeGroup(group)} title="Xoá nhóm" type="button"><Trash className="size-4" /></button>
                    </>
                  )}
                </span>
              </div>
            </CardHeader>
            {open && (
              <CardBody className="flex flex-col gap-5">
                {(errors.length > 0 || warnings.length > 0) && (
                  <ul className="flex flex-col gap-1 text-xs">
                    {errors.map((issue) => <li key={issue.message} className="flex items-start gap-1.5 text-status-danger"><XCircle className="mt-0.5 size-3.5 shrink-0" />{issue.message}</li>)}
                    {warnings.map((issue) => <li key={issue.message} className="flex items-start gap-1.5 text-status-warning"><Warning className="mt-0.5 size-3.5 shrink-0" />{issue.message}</li>)}
                  </ul>
                )}

                {!group.isDefault && (
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="w-full max-w-sm">
                      <Input label="Tên nhóm" maxLength={100} value={group.name} onChange={(event) => updateGroup(group.key, (item) => ({ ...item, name: event.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-fb-text-secondary">Master toggle</span>
                      <BooleanPillToggle value={group.enabled} onChange={(value) => updateGroup(group.key, (item) => ({ ...item, enabled: value }))} trueLabel="Bật" falseLabel="Tắt" size="sm" />
                    </div>
                  </div>
                )}

                {!group.isDefault && (
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Điều kiện ngày của Epic</h3>
                    <TableContainer className="overflow-x-auto">
                      <Table className="w-full min-w-[560px]">
                        <THead><TR><TH className="px-3 py-2 text-xs">Ngày</TH><TH className="px-3 py-2 text-xs">Từ ngày (≥)</TH><TH className="px-3 py-2 text-xs">Đến ngày (≤)</TH><TH className="px-3 py-2 text-xs" /></TR></THead>
                        <TBody>
                          {RULE_GROUP_DATE_FIELD_ORDER.map((field) => {
                            const range = group.conditions[field];
                            return (
                              <TR key={field}>
                                <TD className="px-3 py-2 text-xs font-semibold text-fb-text-primary">{RULE_GROUP_DATE_FIELD_LABELS[field]}</TD>
                                <TD className="px-3 py-2"><input aria-label={`${RULE_GROUP_DATE_FIELD_LABELS[field]} từ ngày`} className={DATE_INPUT_CLASS} onChange={(event) => setDate(group.key, field, 'from', event.target.value)} type="date" value={range.from ?? ''} /></TD>
                                <TD className="px-3 py-2"><input aria-label={`${RULE_GROUP_DATE_FIELD_LABELS[field]} đến ngày`} className={DATE_INPUT_CLASS} onChange={(event) => setDate(group.key, field, 'to', event.target.value)} type="date" value={range.to ?? ''} /></TD>
                                <TD className="px-3 py-2">
                                  <button aria-label="Xoá điều kiện" className={ICON_BUTTON_CLASS} disabled={!range.from && !range.to} onClick={() => { setDate(group.key, field, 'from', ''); setDate(group.key, field, 'to', ''); }} title="Xoá điều kiện" type="button"><ArrowCounterClockwise className="size-3.5" /></button>
                                </TD>
                              </TR>
                            );
                          })}
                        </TBody>
                      </Table>
                    </TableContainer>
                  </section>
                )}

                <section className="flex flex-col gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Rule áp dụng</h3>
                  {RULE_CATEGORY_ORDER.map((category) => {
                    const rules = selectable.filter((rule) => rule.category === category);
                    if (!rules.length) return null;
                    const slot = SLOTS.find((item) => rules.some((rule) => rule.slot === item));
                    const slotRules = rules.filter((rule) => rule.slot);
                    const otherRules = rules.filter((rule) => !rule.slot);
                    const selectedSlotRule = slotRules.find((rule) => group.ruleIds.includes(rule.id))?.id ?? null;
                    return (
                      <div key={category} className="rounded-lg border border-fb-border">
                        <div className="flex items-center justify-between gap-2 border-b border-fb-border bg-fb-surface-muted px-3 py-2">
                          <span className="text-xs font-bold text-fb-text-primary">{RULE_CATEGORY_LABELS[category]}</span>
                          {otherRules.length > 1 && (
                            <span className="flex gap-3 text-xs">
                              <button className="font-semibold text-fb-text-secondary hover:text-fb-text-primary" onClick={() => otherRules.forEach((rule) => toggleRule(group.key, rule.id, true))} type="button">Chọn tất cả</button>
                              <button className="font-semibold text-fb-text-secondary hover:text-fb-text-primary" onClick={() => otherRules.forEach((rule) => toggleRule(group.key, rule.id, false))} type="button">Bỏ chọn</button>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col divide-y divide-fb-border">
                          {slot && (
                            <>
                              {slotRules.map((rule) => (
                                <RuleOption key={rule.id} checked={selectedSlotRule === rule.id} name={`slot-${group.key}-${slot}`} onChange={() => setSlotRule(group.key, slot, rule.id)} onHelp={() => setDetailRule(rule)} rule={rule} type="radio" />
                              ))}
                              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-fb-surface-muted">
                                <input checked={selectedSlotRule === null} className="mt-0.5" name={`slot-${group.key}-${slot}`} onChange={() => setSlotRule(group.key, slot, null)} type="radio" />
                                <span className="text-xs text-fb-text-secondary">Không áp dụng rule {RULE_SLOT_LABELS[slot]} cho nhóm này</span>
                              </label>
                            </>
                          )}
                          {otherRules.map((rule) => (
                            <RuleOption key={rule.id} checked={group.ruleIds.includes(rule.id)} onChange={(on) => toggleRule(group.key, rule.id, on)} onHelp={() => setDetailRule(rule)} rule={rule} type="checkbox" />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              </CardBody>
            )}
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <div className="min-w-0 flex-1">
            <CardTitle>Rule luôn chạy</CardTitle>
            <p className="mt-1 text-xs text-fb-text-secondary">Áp dụng cho mọi Epic, không chọn trong nhóm (cổng tính toán, phạm vi, pha và các rule chủ sở hữu quyết định luôn chạy).</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col divide-y divide-fb-border p-0">
          {coreRules.map((rule) => (
            <div key={rule.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-fb-text-primary">{rule.name}</div>
                <div className="text-xs text-fb-text-secondary">{rule.summary}</div>
              </div>
              <button aria-label={`Chi tiết ${rule.name}`} className={ICON_BUTTON_CLASS} onClick={() => setDetailRule(rule)} title="Chi tiết rule" type="button"><Question className="size-4" /></button>
            </div>
          ))}
        </CardBody>
      </Card>

      <RuleDetailModal onClose={() => setDetailRule(null)} rule={detailRule} />

      <Modal isOpen={historyOpen} maxWidth="2xl" onClose={() => setHistoryOpen(false)} title="Lịch sử thay đổi nhóm rule">
        {!history ? <TableSkeleton rows={4} /> : history.length === 0 ? (
          <p className="text-sm text-fb-text-secondary">Chưa có lần lưu nào.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {history.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-fb-border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-fb-text-primary">{formatDateTime(entry.savedAt)}</span>
                  <span className="text-fb-text-secondary">{entry.savedByName ?? 'Không rõ người lưu'}</span>
                  <Badge variant="neutral" className="font-mono text-xs">{entry.ruleCodeVersion}</Badge>
                </div>
                <ul className="list-disc pl-5 text-xs text-fb-text-primary">
                  {describeHistory(entry, ruleNames).map((line) => <li key={line}>{line}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </div>
  );
}

interface RuleOptionProps {
  checked: boolean;
  name?: string;
  onChange: (checked: boolean) => void;
  onHelp: () => void;
  rule: RuleCatalogItem;
  type: 'checkbox' | 'radio';
}

function RuleOption({ checked, name, onChange, onHelp, rule, type }: RuleOptionProps) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-fb-surface-muted">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input checked={checked} className="mt-0.5" disabled={rule.lifecycle === 'deprecated' && !checked} name={name} onChange={(event) => onChange(event.target.checked)} type={type} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-fb-text-primary">{rule.name}</span>
            <span className="font-mono text-xs text-fb-text-secondary">{rule.id}</span>
            {rule.lifecycle === 'deprecated' && <Badge variant="warning" className="text-xs">Ngừng dùng</Badge>}
          </span>
          <span className="block text-xs leading-snug text-fb-text-secondary">{rule.summary}</span>
        </span>
      </label>
      <button aria-label={`Chi tiết ${rule.name}`} className={ICON_BUTTON_CLASS} onClick={onHelp} title="Logic, điều kiện áp dụng của rule" type="button"><Question className="size-4" /></button>
    </div>
  );
}

function RuleDetailModal({ onClose, rule }: { onClose: () => void; rule: RuleCatalogItem | null }) {
  return (
    <Modal isOpen={rule !== null} maxWidth="2xl" onClose={onClose} title={rule?.name ?? ''}>
      {rule && (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="neutral" className="font-mono">{rule.id}</Badge>
            <Badge variant="info">{RULE_CATEGORY_LABELS[rule.category]}</Badge>
            {rule.core ? <Badge variant="pending">Luôn chạy</Badge> : <Badge variant="success">Chọn theo nhóm</Badge>}
            {rule.slot && <Badge variant="warning">Rule đánh giá {RULE_SLOT_LABELS[rule.slot]} — mỗi nhóm chọn tối đa 1</Badge>}
            {rule.policySet && <Badge variant="neutral">Bộ ngân sách: {rule.policySet}</Badge>}
          </div>
          <p className="text-fb-text-primary">{rule.summary}</p>
          <section>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Điều kiện áp dụng</h4>
            <p className="text-fb-text-primary">{rule.conditions}</p>
            {rule.requires.length > 0 && <p className="mt-1 text-xs text-status-warning">Cần có rule đánh giá {rule.requires.map((slot) => RULE_SLOT_LABELS[slot]).join(', ')} trong cùng nhóm.</p>}
          </section>
          <section>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Logic — badge rule phát ra</h4>
            <TableContainer>
              <Table className="w-full">
                <THead><TR><TH className="px-3 py-2 text-xs">Badge</TH><TH className="px-3 py-2 text-xs">Nhóm</TH><TH className="px-3 py-2 text-xs">Công thức</TH></TR></THead>
                <TBody>
                  {rule.emits.map((badge) => (
                    <TR key={badge.id}>
                      <TD className="px-3 py-2 align-top text-xs font-semibold">{badge.label}</TD>
                      <TD className="px-3 py-2 align-top text-xs">{FINDING_GROUP_LABEL[badge.group] ?? badge.group}</TD>
                      <TD className="px-3 py-2 align-top text-xs text-fb-text-secondary">{badge.formula}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </section>
          {rule.parameters.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Tham số dùng</h4>
              <ul className="list-disc pl-5 text-xs">{rule.parameters.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}
          {rule.history.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-fb-text-secondary">Lịch sử thay đổi logic</h4>
              <ul className="list-disc pl-5 text-xs">{rule.history.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

function PreviewCard({ error, preview, previewing, stale }: { error: string | null; preview: RuleGroupPreviewResponse | null; previewing: boolean; stale: boolean }) {
  if (error) return <Alert title="Không xem trước được" variant="error"><span className="whitespace-pre-line">{error}</span></Alert>;
  if (!preview) return previewing ? <Card><CardBody><p className="text-xs text-fb-text-secondary">Đang chấm thử toàn bộ Epic…</p></CardBody></Card> : null;
  const rows: { label: string; value: (totals: RuleGroupPreviewTotals) => string }[] = [
    { label: 'TTM-CNTT (QLDA) — Đạt / Fail', value: (t) => `${formatNumber(t.ttmPass)} / ${formatNumber(t.ttmFail)}` },
    { label: 'TTM-CNTT (QLDA) — Tỷ lệ % Pass', value: (t) => passPct(t.ttmPass, t.ttmFail) },
    { label: 'TTM-CNTT (QA) — Đạt / Fail', value: (t) => `${formatNumber(t.qaPass)} / ${formatNumber(t.qaFail)}` },
    { label: 'TTM-CNTT (QA) — Tỷ lệ % Pass', value: (t) => passPct(t.qaPass, t.qaFail) },
    { label: 'TTM-E2E — Đạt / Fail', value: (t) => `${formatNumber(t.e2ePass)} / ${formatNumber(t.e2eFail)}` },
    { label: 'TTM-E2E — Tỷ lệ % Pass', value: (t) => passPct(t.e2ePass, t.e2eFail) },
    { label: 'Sai lệch dữ liệu', value: (t) => formatNumber(t.dataAnomaly) },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Xem trước tác động</CardTitle>
          {stale && <Badge variant="warning">Số liệu của bản trước — bấm &quot;Xem trước tác động&quot; để tính lại</Badge>}
        </div>
        <p className="mt-1 text-xs text-fb-text-secondary">
          Chấm thử {formatNumber(preview.epicCount)} Epic tại ngày {preview.asOf.split('-').reverse().join('/')} (lớp dữ liệu mới nhất, mọi Epic, theo &quot;Phạm vi dữ liệu cho TTM&quot;) với cấu hình đã lưu và cấu hình đang sửa.
          {' '}{formatNumber(preview.changedEpicCount)} Epic đổi kết quả; {formatNumber(preview.excludedCount)} Epic ngoại lệ không thuộc nhóm nào.
        </p>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <TableContainer className="overflow-x-auto">
          <Table className="w-full">
            <THead><TR><TH className="px-4 py-2 text-xs">Chỉ số</TH><TH className="px-4 py-2 text-right text-xs">Cấu hình đã lưu</TH><TH className="px-4 py-2 text-right text-xs">Cấu hình đang sửa</TH></TR></THead>
            <TBody>
              {rows.map((row) => {
                const before = row.value(preview.current);
                const after = row.value(preview.draft);
                return (
                  <TR key={row.label}>
                    <TD className="px-4 py-2 text-xs font-semibold">{row.label}</TD>
                    <TD className="px-4 py-2 text-right text-xs tabular-nums">{before}</TD>
                    <TD className={`px-4 py-2 text-right text-xs tabular-nums ${before !== after ? 'font-bold text-status-warning' : ''}`}>{after}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </CardBody>
    </Card>
  );
}

