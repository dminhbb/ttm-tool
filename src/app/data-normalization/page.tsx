'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowSquareOut, Broom, CaretDown, CaretRight, ClockCounterClockwise, Lightbulb, Warning } from '@phosphor-icons/react';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ToolbarMultiSelect } from '@/components/ui/ToolbarMultiSelect';
import { Tooltip } from '@/components/ui/Tooltip';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import type { NormalizationEpicRow, NormalizationPanel } from '@/lib/data-normalization';
import type { TtmDashboard2FilterOptions } from '@/lib/ttm-funnel-summary';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
// Lớp control dùng chung (.ttm-toolbar / .ttm-select / .ttm-button) — cùng file với TTM Dashboard 2.
import '@/app/ttm-shared.css';

interface DataNormalizationResponse {
  actor: { fullName: string; role: string };
  engineMode: 'legacy' | 'scoring';
  filterOptions: TtmDashboard2FilterOptions;
  lastAggregatedAt: string | null;
  panels: NormalizationPanel[];
  totalEpics: number;
}

const EMPTY_FILTER_OPTIONS: TtmDashboard2FilterOptions = { domainProjectKeys: {}, domains: [], pmSms: [], projectComponents: {}, projects: [], requestingUnits: [] };
/** Compact controls of the paging cluster: `.ttm-select` is `flex: 1 1 140px`, which made the select
 * huge and wrapped "/ N" onto a second line. Inline style because it must beat that class. */
const PAGER_BUTTON_STYLE = { minHeight: 30, padding: '4px 12px' } as const;
const PAGER_SELECT_STYLE = { flex: '0 0 auto', minHeight: 30, padding: '4px 8px', width: 64 } as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

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

/** "R1:2,R5:3" — only the panels that are not on their first page. */
function pagesParam(pages: Record<string, number>): string {
  return Object.entries(pages).filter(([, page]) => page > 1).map(([code, page]) => `${code}:${page}`).join(',');
}

/** The "Epic" cell — icons + key on ONE line (the summary has its own column). */
function EpicCell({ onBrowse, row, viewIssueBaseUrl }: { onBrowse: (epicKey: string) => void; row: NormalizationEpicRow; viewIssueBaseUrl: string }) {
  return (
    <TD className="min-w-[170px] !py-1">
      <div className="flex items-center gap-1">
        <Tooltip multiline className="inline-flex w-auto" content={row.violations.map((message) => `• ${message}`).join('\n')}>
          <Warning aria-label="Epic vi phạm rule này" className="size-4 shrink-0 text-status-warning" weight="fill" />
        </Tooltip>
        {viewIssueBaseUrl && (
          <a
            aria-label="Mở Epic trên Jira"
            className="inline-flex shrink-0 items-center p-0.5 text-fb-text-secondary hover:text-fb-blue"
            href={`${viewIssueBaseUrl}${row.epicKey}`}
            rel="noopener noreferrer"
            target="_blank"
            title="Mở Epic trên Jira"
          >
            <ArrowSquareOut className="size-4" weight="bold" />
          </a>
        )}
        <button
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-extrabold text-[var(--color-text-brand)] hover:underline"
          onClick={() => onBrowse(row.epicKey)}
          title="Duyệt Epic (Epic Browser)"
          type="button"
        >
          {row.epicKey}
        </button>
      </div>
    </TD>
  );
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

function RulePanel({ engineMode, isOpen, onBrowse, onPageChange, onToggle, panel, viewIssueBaseUrl }: {
  engineMode: 'legacy' | 'scoring';
  isOpen: boolean;
  onBrowse: (epicKey: string) => void;
  onPageChange: (code: string, page: number) => void;
  onToggle: (code: string) => void;
  panel: NormalizationPanel;
  viewIssueBaseUrl: string;
}) {
  const unavailable = !panel.inLegacyEngine && engineMode === 'legacy';
  const bodyId = `rule-body-${panel.code}`;
  const Chevron = isOpen ? CaretDown : CaretRight;
  return (
    <section aria-labelledby={`rule-${panel.code}`} className="overflow-hidden rounded-xl border border-fb-border bg-fb-surface shadow-sm">
      <header className={isOpen ? 'border-b border-fb-border' : undefined}>
        <button
          aria-controls={bodyId}
          aria-expanded={isOpen}
          className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-3 text-left hover:bg-fb-surface-muted"
          onClick={() => onToggle(panel.code)}
          type="button"
        >
          <Chevron aria-hidden="true" className="size-4 shrink-0 text-fb-text-secondary" weight="bold" />
          <Badge variant="neutral">{panel.code}</Badge>
          <h2 className="text-sm font-extrabold text-fb-text-primary" id={`rule-${panel.code}`}>{panel.label}</h2>
          <Badge variant={panel.totalCount > 0 ? 'warning' : 'success'}>{panel.totalCount} Epic</Badge>
        </button>
        {isOpen && (
          <div className="space-y-2 px-4 pb-3">
            <p className="text-xs leading-5 text-fb-text-secondary">{panel.meaning}</p>
            {panel.guide && (
              <p className="flex items-start gap-1.5 text-xs leading-5 text-fb-text-primary">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-status-warning" weight="fill" />
                <span><strong>Cách chuẩn hoá:</strong> {panel.guide}</span>
              </p>
            )}
          </div>
        )}
      </header>

      {isOpen && (
        <div id={bodyId}>
          {panel.rows.length === 0 ? (
            <EmptyState
              className="m-4"
              title={unavailable ? 'Rule chỉ có ở Scoring Service' : 'Không có Epic cần chuẩn hoá'}
              description={unavailable ? 'Màn hình đang hiển thị theo engine cũ (legacy), engine này không đánh giá rule này.' : 'Không có Epic nào trong phạm vi và bộ lọc hiện tại vi phạm rule này.'}
            />
          ) : (
            <TableContainer>
              <Table className="min-w-[960px]">
                <THead>
                  <TR>
                    <TH className="min-w-[170px]">Epic</TH>
                    <TH className="min-w-[280px]">Summary</TH>
                    <TH>Created date</TH>
                    <TH>Ngày duyệt ý tưởng</TH>
                    <TH>Start date</TH>
                    <TH>R4G date</TH>
                    <TH>Due date</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {panel.rows.map((row) => (
                    <TR key={row.epicKey}>
                      <EpicCell onBrowse={onBrowse} row={row} viewIssueBaseUrl={viewIssueBaseUrl} />
                      <TD className="max-w-[420px] truncate !py-1" title={row.epicName}>{row.epicName || '—'}</TD>
                      <TD className="!py-1">{formatDate(row.createdDate)}</TD>
                      <TD className="!py-1">{formatDate(row.ideaApprovedDate)}</TD>
                      <TD className="!py-1">{formatDate(row.startDate)}</TD>
                      <TD className="!py-1">{formatDate(row.r4gDate)}</TD>
                      <TD className="!py-1">{formatDate(row.dueDate)}</TD>
                      <TD className="!py-1">
                        {row.status
                          ? <span className="rounded-full border border-fb-border bg-fb-surface-muted px-2 py-0.5 text-[11px] font-semibold text-fb-text-primary">{row.status}</span>
                          : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
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
  const viewIssueBaseUrl = useJiraViewIssueUrl();

  // Same toolbar filters as TTM Dashboard 2.
  const [filterDomain, setFilterDomain] = useState('');
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [filterComponents, setFilterComponents] = useState<string[]>([]);
  const [filterPmSms, setFilterPmSms] = useState<string[]>([]);
  const [filterRequestingUnits, setFilterRequestingUnits] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<string, number>>({});
  // Every panel starts collapsed: eight rules of up to 25 Epics each make a very long page.
  const [openPanels, setOpenPanels] = useState<ReadonlySet<string>>(new Set());
  const togglePanel = (code: string) => setOpenPanels((current) => {
    const next = new Set(current);
    if (!next.delete(code)) next.add(code);
    return next;
  });

  const filterOptions = data?.filterOptions ?? EMPTY_FILTER_OPTIONS;
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
  const hasFilter = Boolean(filterDomain || filterProjects.length || filterComponents.length || filterPmSms.length || filterRequestingUnits.length);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filterDomain) params.set('domain', filterDomain);
    if (filterProjects.length) params.set('projects', filterProjects.join(','));
    if (filterComponents.length) params.set('components', filterComponents.join(','));
    if (filterPmSms.length) params.set('pmSms', filterPmSms.join(','));
    if (filterRequestingUnits.length) params.set('requestingUnits', filterRequestingUnits.join(','));
    const pageText = pagesParam(pages);
    if (pageText) params.set('pages', pageText);
    return params.toString();
  }, [filterComponents, filterDomain, filterPmSms, filterProjects, filterRequestingUnits, pages]);

  const requestIdRef = useRef(0);
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    void Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/data-normalization${query ? `?${query}` : ''}`, { cache: 'no-store' });
        const json: unknown = await res.json();
        if (requestIdRef.current !== requestId) return;
        if (!res.ok) {
          throw new Error(typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : 'Không thể tải dữ liệu.');
        }
        setData(json as DataNormalizationResponse);
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
            <p className="text-[11px] text-fb-text-secondary">Epic cần chuẩn hoá theo từng rule Sai lệch dữ liệu • một Epic có thể nằm ở nhiều rule</p>
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

        {hasFilter && (
          <button
            className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-fb-text-placeholder transition-colors hover:bg-status-danger-soft hover:text-status-danger"
            onClick={() => changeFilters(() => {
              setFilterDomain('');
              setFilterProjects([]);
              setFilterComponents([]);
              setFilterPmSms([]);
              setFilterRequestingUnits([]);
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
              engineMode={data.engineMode}
              isOpen={openPanels.has(panel.code)}
              key={panel.code}
              onBrowse={setBrowsingEpicKey}
              onPageChange={(code, page) => setPages((current) => ({ ...current, [code]: page }))}
              onToggle={togglePanel}
              panel={panel}
              viewIssueBaseUrl={viewIssueBaseUrl}
            />
          ))}
        </div>
      )}

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
