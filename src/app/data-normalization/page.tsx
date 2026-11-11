'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Broom, CaretDown, CaretRight, ClockCounterClockwise, Lightbulb } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { NormalizationEpicTable } from '@/components/data-normalization/NormalizationEpicTable';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { EpicMarkModal } from '@/components/epic-mark/EpicMarkModal';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import type { NormalizationPanel } from '@/lib/data-normalization';
import { EPIC_FIELD_CHANGE_DEFAULT_FIELD, EPIC_FIELD_CHANGE_DEFAULT_FROM, EPIC_FIELD_CHANGE_FIELDS, EPIC_FIELD_CHANGE_LABEL, type EpicFieldChangeField } from '@/lib/epic-field-changes';
import type { TtmDashboard2FilterOptions } from '@/lib/ttm-funnel-summary';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { cn } from '@/lib/utils';
// Lớp control dùng chung (.ttm-toolbar / .ttm-select / .ttm-button) — cùng file với TTM Dashboard 2.
import '@/app/ttm-shared.css';

interface DataNormalizationResponse {
  actor: { fullName: string; role: string };
  /** Only sent when asked for (`options=1`, the first load). */
  filterOptions: TtmDashboard2FilterOptions | null;
  lastAggregatedAt: string | null;
  panels: NormalizationPanel[];
  totalEpics: number;
}

const EMPTY_FILTER_OPTIONS: TtmDashboard2FilterOptions = { domainProjectKeys: {}, domains: [], pmSms: [], projectComponents: {}, projects: [], requestingUnits: [], ruleGroups: [] };
/** Compact controls of the paging cluster: `.ttm-select` is `flex: 1 1 140px`, which made the select
 * huge and wrapped "/ N" onto a second line. Inline style because it must beat that class. */
const PAGER_BUTTON_STYLE = { minHeight: 30, padding: '4px 12px' } as const;
const PAGER_SELECT_STYLE = { flex: '0 0 auto', minHeight: 30, padding: '4px 8px', width: 64 } as const;

function formatDateTime(value: string | null): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hour}:${minute}`;
}

/** "R1:2,R5:3" — only the panels that are not on their first page (panel codes hold no comma). */
function pagesParam(pages: Record<string, number>): string {
  return Object.entries(pages).filter(([, page]) => page > 1).map(([code, page]) => `${code}:${page}`).join(',');
}

/** Same menu and paging as Quản trị Epic: ‹ Trước · Trang [chọn trang] / N · Sau ›. */
function PanelPagination({ onPageChange, panel }: { onPageChange: (page: number) => void; panel: NormalizationPanel }) {
  const first = panel.totalCount === 0 ? 0 : (panel.page - 1) * panel.pageSize + 1;
  const last = (panel.page - 1) * panel.pageSize + panel.rows.length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-fb-border px-4 py-2">
      <p className="text-xs text-fb-text-secondary">Hiển thị {first}–{last} / {panel.totalCount} Epic</p>
      {panel.totalCount > 0 && (
        <nav aria-label={`Điều hướng phân trang ${panel.code}`} className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
          <button className="ttm-button" disabled={panel.page <= 1} onClick={() => onPageChange(panel.page - 1)} style={PAGER_BUTTON_STYLE} type="button">‹ Trước</button>
          <span className="text-xs text-fb-text-secondary">Trang</span>
          <select
            aria-label={`Chọn trang ${panel.code}`}
            className="ttm-select"
            onChange={(event) => onPageChange(Number(event.target.value))}
            style={PAGER_SELECT_STYLE}
            value={panel.page}
          >
            {Array.from({ length: panel.totalPages }, (_, index) => index + 1).map((pageNumber) => (
              <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
            ))}
          </select>
          <span className="text-xs text-fb-text-secondary">/ {panel.totalPages}</span>
          <button className="ttm-button" disabled={panel.page >= panel.totalPages} onClick={() => onPageChange(panel.page + 1)} style={PAGER_BUTTON_STYLE} type="button">Sau ›</button>
        </nav>
      )}
    </div>
  );
}

function RulePanel({ changesField, changesFrom, isOpen, onBrowse, onChangesFieldChange, onChangesFromChange, onPageChange, onReview, onToggle, panel, viewIssueBaseUrl }: {
  /** "Epic thay đổi dữ liệu": the created-date calendar and the one-field filter of its button row. */
  changesField: EpicFieldChangeField;
  changesFrom: string;
  onChangesFieldChange: (value: EpicFieldChangeField) => void;
  onChangesFromChange: (value: string) => void;
  isOpen: boolean;
  onBrowse: (epicKey: string) => void;
  onPageChange: (code: string, page: number) => void;
  onReview: (epicKey: string) => void;
  onToggle: (code: string) => void;
  panel: NormalizationPanel;
  viewIssueBaseUrl: string;
}) {
  // Opened before its Epics arrived: rows are only sent for the panels the page asked for. A section counted 0 Epic
  // shows "Không có Epic cần chuẩn hoá" at once — it is never asked for (owner 2026-11-10).
  const awaitingRows = !panel.rowsLoaded && panel.totalCount > 0;
  const bodyId = `rule-body-${panel.code}`;
  const Chevron = isOpen ? CaretDown : CaretRight;
  // "Khuyến nghị" panel (owner 2026-11-09): light green header — a recommendation, not a rule to fix.
  const isRecommendation = panel.tone === 'recommendation';
  const isChange = panel.tone === 'change';
  return (
    <section aria-labelledby={`rule-${panel.code}`} className="overflow-hidden rounded-xl border border-fb-border bg-fb-surface shadow-sm">
      {/* Recommendation: light green; "Epic thay đổi dữ liệu": pastel purple (owner 2026-11-11, .dn-panel-change). */}
      <header className={cn(isOpen && 'border-b border-fb-border', isRecommendation && 'bg-status-success-soft', isChange && 'dn-panel-change')}>
        <div className="flex flex-wrap items-center gap-2 pr-4">
        <button
          aria-controls={bodyId}
          aria-expanded={isOpen}
          className={cn('flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-3 text-left', isRecommendation || isChange ? 'hover:brightness-95' : 'hover:bg-fb-surface-muted')}
          onClick={() => onToggle(panel.code)}
          type="button"
        >
          <Chevron aria-hidden="true" className="size-4 shrink-0 text-fb-text-secondary" weight="bold" />
          <Badge variant={isRecommendation ? 'success' : 'neutral'}>{panel.tag}</Badge>
          <h2 className="text-sm font-normal text-fb-text-primary" id={`rule-${panel.code}`}>{panel.label}</h2>
          {/* Count > 0: orange with white text (owner 2026-11-09); 0 stays green. */}
          <Badge className={panel.totalCount > 0 ? 'dn-count-badge-alert' : undefined} variant={panel.totalCount > 0 ? 'warning' : 'success'}>{panel.totalCount} Epic</Badge>
        </button>
        </div>
        {isOpen && (
          <div className="space-y-2 px-4 pb-3">
            <p className="text-xs leading-5 text-fb-text-secondary">{panel.meaning}</p>
            {panel.guide && (
              <p className="flex items-start gap-1.5 text-xs leading-5 text-fb-text-primary">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-status-warning" weight="fill" />
                <span><strong>Cách chuẩn hoá:</strong> {panel.guide}</span>
              </p>
            )}
            {isChange && (
              // Button row of "Epic thay đổi dữ liệu" (owner 2026-11-11): the created-date calendar (default 01/02/2026) and
              // exactly one field — "Thay đổi Start date" by default; clicking the active one keeps it.
              <div className="dn-change-filter-row flex flex-wrap items-center gap-2 rounded-lg px-3 py-2" role="group" aria-label="Bộ lọc Epic thay đổi dữ liệu">
                <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-fb-text-primary" title="Chỉ liệt kê Epic có Created date từ ngày này">
                  Created date từ
                  <input
                    aria-label="Created date từ ngày"
                    className="ttm-field"
                    onChange={(event) => onChangesFromChange(event.target.value || EPIC_FIELD_CHANGE_DEFAULT_FROM)}
                    style={{ minHeight: 30, padding: '3px 8px' }}
                    type="date"
                    value={changesFrom}
                  />
                </label>
                {EPIC_FIELD_CHANGE_FIELDS.map((field) => {
                  const active = field === changesField;
                  return (
                    <button
                      aria-pressed={active}
                      className={cn(
                        'inline-flex h-[30px] cursor-pointer items-center rounded-md border px-3 text-xs font-semibold transition-colors',
                        active ? 'border-fb-blue bg-fb-blue text-white' : 'border-fb-border bg-fb-surface text-fb-text-secondary hover:border-fb-blue hover:text-fb-blue',
                      )}
                      key={field}
                      onClick={() => { if (!active) onChangesFieldChange(field); }}
                      type="button"
                    >
                      Thay đổi {EPIC_FIELD_CHANGE_LABEL[field]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>

      {isOpen && (
        <div id={bodyId}>
          {awaitingRows ? (
            <div className="p-4"><TableSkeleton rows={3} /></div>
          ) : panel.rows.length === 0 ? (
            <EmptyState
              className="m-4"
              title="Không có Epic cần chuẩn hoá"
              description={isRecommendation
                ? 'Không có Epic nào trong phạm vi và bộ lọc hiện tại có khuyến nghị này.'
                : isChange
                  ? 'Không có Epic nào (Created date từ ngày đã chọn, trong phạm vi và bộ lọc hiện tại) thay đổi Start date / R4G Date / Requirement Level / Loại yêu cầu.'
                  : 'Không có Epic nào trong phạm vi và bộ lọc hiện tại vi phạm rule này.'}
            />
          ) : (
            <NormalizationEpicTable onBrowse={onBrowse} onReview={onReview} rows={panel.rows} tone={panel.tone} viewIssueBaseUrl={viewIssueBaseUrl} />
          )}
          <PanelPagination onPageChange={(page) => onPageChange(panel.code, page)} panel={panel} />
        </div>
      )}
    </section>
  );
}

export default function DataNormalizationPage() {
  const [data, setData] = useState<DataNormalizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browsingEpicKey, setBrowsingEpicKey] = useState<string | null>(null);
  // Review Notes popup of the column REVIEW (owner 2026-11-10); a change reloads the screen (reloadToken).
  const [reviewEpicKey, setReviewEpicKey] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // "Epic thay đổi dữ liệu": Created date from (owner 2026-11-11).
  const [changesFrom, setChangesFrom] = useState(EPIC_FIELD_CHANGE_DEFAULT_FROM);
  const [changesField, setChangesField] = useState<EpicFieldChangeField>(EPIC_FIELD_CHANGE_DEFAULT_FIELD);
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  // Same toolbar filters as TTM Dashboard 2.
  const [filterDomain, setFilterDomain] = useState('');
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterComponents, setFilterComponents] = useState<string[]>([]);
  const [filterPmSms, setFilterPmSms] = useState<string[]>([]);
  const [filterRequestingUnits, setFilterRequestingUnits] = useState<string[]>([]);
  const [filterRuleGroups, setFilterRuleGroups] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  // Every panel starts collapsed: ten panels of up to 25 Epics each make a very long page.
  const [openPanels, setOpenPanels] = useState<ReadonlySet<string>>(new Set());
  // The panels whose Epic rows the API is asked for: every panel opened so far. It only grows, so
  // collapsing a panel doesn't refetch and reopening it shows its rows at once.
  const [requestedPanels, setRequestedPanels] = useState<readonly string[]>([]);
  const togglePanel = (code: string, totalCount: number) => {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
    // A section counted 0 Epic needs no request: it opens straight on "Không có Epic cần chuẩn hoá".
    if (totalCount > 0) setRequestedPanels((current) => (current.includes(code) ? current : [...current, code].sort()));
  };

  // The toolbar options cover the viewer's whole scope and don't depend on the filters: sent with the
  // first response only, kept here for the rest of the visit.
  const [filterOptions, setFilterOptions] = useState<TtmDashboard2FilterOptions>(EMPTY_FILTER_OPTIONS);
  const hasFilterOptionsRef = useRef(false);
  const isAdminOrSupervisor = data ? ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(data.actor.role) : false;

  // "Component" depends on "Dự án" (same rule as TTM Dashboard 2 / Quản trị Epic).
  const componentsOfProjects = (projectKeys: readonly string[]) =>
    [...new Set(projectKeys.flatMap((key) => filterOptions.projectComponents?.[key] ?? []))].sort((a, b) => a.localeCompare(b, 'vi'));
  const componentOptions = componentsOfProjects(filterProjects);

  // Any filter change goes back to the first page of every panel.
  const changeFilters = (change: () => void) => {
    change();
    setPages({});
  };
  const applyProjectFilter = (projectKeys: string[]) => {
    setFilterProjects(projectKeys);
    const available = componentsOfProjects(projectKeys);
    setFilterComponents((current) => current.filter((component) => available.includes(component)));
  };
  const hasFilter = Boolean(filterDomain || filterProjects.length || filterComponents.length || filterPmSms.length || filterRequestingUnits.length || filterRuleGroups.length);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filterDomain) params.set('domain', filterDomain);
    // One value per repeated key — a "Đơn vị yêu cầu" or component name may contain a comma.
    for (const key of filterProjects) params.append('projects', key);
    for (const component of filterComponents) params.append('components', component);
    for (const name of filterPmSms) params.append('pmSms', name);
    for (const unit of filterRequestingUnits) params.append('requestingUnits', unit);
    for (const group of filterRuleGroups) params.append('ruleGroups', group);
    // The sections asked for + any open one whose count grew above 0 after a filter change (it was opened at 0).
    const wanted = new Set(requestedPanels);
    for (const panel of data?.panels ?? []) if (openPanels.has(panel.code) && panel.totalCount > 0) wanted.add(panel.code);
    if (wanted.size) params.set('open', [...wanted].sort().join(','));
    const pageText = pagesParam(pages);
    if (pageText) params.set('pages', pageText);
    if (reloadToken) params.set('r', String(reloadToken));
    if (changesFrom !== EPIC_FIELD_CHANGE_DEFAULT_FROM) params.set('changesFrom', changesFrom);
    if (changesField !== EPIC_FIELD_CHANGE_DEFAULT_FIELD) params.set('changesField', changesField);
    return params.toString();
  }, [changesField, changesFrom, data?.panels, filterComponents, filterDomain, filterPmSms, filterProjects, filterRequestingUnits, filterRuleGroups, openPanels, pages, reloadToken, requestedPanels]);

  const requestIdRef = useRef(0);
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    void Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const fullQuery = [query, hasFilterOptionsRef.current ? '' : 'options=1'].filter(Boolean).join('&');
        const res = await fetch(`/api/data-normalization${fullQuery ? `?${fullQuery}` : ''}`, { cache: 'no-store' });
        const json: unknown = await res.json();
        if (requestIdRef.current !== requestId) return;
        if (!res.ok) {
          throw new Error(typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : 'Không thể tải dữ liệu.');
        }
        const payload = json as DataNormalizationResponse;
        if (payload.filterOptions) {
          hasFilterOptionsRef.current = true;
          setFilterOptions(payload.filterOptions);
        }
        setData(payload);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    });
  }, [query]);

  return (
    <div className="space-y-4 text-fb-text-primary">
      <InfoBannerDisplay pathname="/data-normalization" />

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-fb-border bg-fb-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-fb-blue-soft text-fb-blue">
            <Broom className="size-5" weight="bold" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold uppercase tracking-tight text-fb-text-primary">Chuẩn hoá dữ liệu</h1>
            <p className="text-[11px] text-fb-text-secondary">Epic thiếu lý do Fail TTM, Epic cần chuẩn hoá theo từng rule Sai lệch dữ liệu và Epic có khuyến nghị Thiếu Change ID • một Epic có thể nằm ở nhiều bảng</p>
          </div>
        </div>
        {data && (
          <p className="text-xs text-fb-text-secondary">
            {data.totalEpics} Epic cần chuẩn hoá
            {data.lastAggregatedAt && <> • Dữ liệu cập nhật: <b>{formatDateTime(data.lastAggregatedAt)}</b></>}
          </p>
        )}
      </div>

      <section aria-label="Bộ lọc Chuẩn hoá dữ liệu" className="ttm-toolbar ttm-toolbar-row">
        <div className="mr-1 flex shrink-0 select-none items-center gap-1.5 text-xs font-bold text-fb-text-primary">
          <CaretRight className="size-4 text-[var(--color-text-brand)]" weight="bold" />
          <span>Filters:</span>
        </div>

        {isAdminOrSupervisor && (
          <select
            aria-label="Domain"
            className={`ttm-select${filterDomain ? ' has-filter' : ''}`}
            onChange={(event) => changeFilters(() => {
              const domain = event.target.value;
              setFilterDomain(domain);
              applyProjectFilter(domain ? [...(filterOptions.domainProjectKeys[domain] ?? [])] : []);
            })}
            value={filterDomain}
          >
            <option value="">Tất cả Domain…</option>
            {filterOptions.domains.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
          </select>
        )}

        <ToolbarMultiSelect
          allLabel="Tất cả dự án"
          ariaLabel="Dự án"
          onChange={(values) => changeFilters(() => { setFilterDomain(''); applyProjectFilter(values); })}
          options={filterOptions.projects}
          searchable
          value={filterProjects}
        />

        <ToolbarMultiSelect
          allLabel="Tất cả component"
          ariaLabel="Component"
          disabled={filterProjects.length === 0}
          onChange={(values) => changeFilters(() => setFilterComponents(values))}
          options={componentOptions}
          searchable
          title={filterProjects.length === 0 ? 'Chọn dự án trước' : undefined}
          value={filterComponents}
        />

        <ToolbarMultiSelect
          allLabel="Tất cả PM/SM"
          ariaLabel="PM/SM"
          onChange={(values) => changeFilters(() => setFilterPmSms(values))}
          options={filterOptions.pmSms}
          searchable
          value={filterPmSms}
        />

        <ToolbarMultiSelect
          allLabel="Tất cả đơn vị yêu cầu"
          ariaLabel="Đơn vị yêu cầu"
          onChange={(values) => changeFilters(() => setFilterRequestingUnits(values))}
          options={filterOptions.requestingUnits}
          searchable
          value={filterRequestingUnits}
        />

        {((filterOptions.ruleGroups ?? []).length > 1 || filterRuleGroups.length > 0) && (
          <ToolbarMultiSelect
            allLabel="Tất cả nhóm rule"
            ariaLabel="Nhóm rule"
            onChange={(values) => changeFilters(() => setFilterRuleGroups(values))}
            options={filterOptions.ruleGroups ?? []}
            value={filterRuleGroups}
          />
        )}

        {hasFilter && (
          <button
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-fb-text-placeholder transition-colors hover:bg-status-danger-soft hover:text-status-danger"
            onClick={() => changeFilters(() => {
              setFilterDomain('');
              setFilterProjects([]);
              setFilterComponents([]);
              setFilterPmSms([]);
              setFilterRequestingUnits([]);
              setFilterRuleGroups([]);
            })}
            title="Xóa tất cả bộ lọc"
            type="button"
          >
            <ClockCounterClockwise className="size-3.5" />
            <span>Đặt lại</span>
          </button>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-status-danger bg-status-danger-soft px-3 py-2 text-xs text-status-danger" role="alert">{error}</div>
      )}

      {!data && loading && <TableSkeleton rows={6} />}

      {data && (
        <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {data.panels.map((panel) => (
            <RulePanel
              isOpen={openPanels.has(panel.code)}
              key={panel.code}
              onBrowse={setBrowsingEpicKey}
              onPageChange={(code, page) => setPages((current) => ({ ...current, [code]: page }))}
              onReview={setReviewEpicKey}
              changesField={changesField}
              changesFrom={changesFrom}
              onChangesFieldChange={(value) => {
                setChangesField(value);
                setPages((current) => ({ ...current, [panel.code]: 1 }));
              }}
              onChangesFromChange={(value) => {
                setChangesFrom(value);
                setPages((current) => ({ ...current, [panel.code]: 1 }));
              }}
              onToggle={(code) => togglePanel(code, panel.totalCount)}
              panel={panel}
              viewIssueBaseUrl={viewIssueBaseUrl}
            />
          ))}
        </div>
      )}

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
      {reviewEpicKey && (
        <EpicMarkModal
          key={reviewEpicKey}
          epicKey={reviewEpicKey}
          onChanged={() => setReloadToken((current) => current + 1)}
          onClose={() => setReviewEpicKey(null)}
        />
      )}
    </div>
  );
}
