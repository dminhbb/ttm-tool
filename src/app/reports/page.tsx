'use client';

import * as React from 'react';
import { ArrowSquareOut, ArrowsClockwise, Bandaids, CaretDown, CaretLineRight, CaretRight, ChartBar, Check, CheckCircle, Checks, FileText, Printer, Pulse, Warning } from '@phosphor-icons/react';
import type { ReportEpicItem, ReportResult } from '@/lib/reports-service';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';

/**
 * Custom Status Font-Color rules per user request:
 * - Pending / To Do: brown (#8B4513)
 * - Released: green (#2E7D32)
 * - R4GOLIVE: lime (#689F38)
 * - In progress: blue navy (#0D47A1)
 */
function getStatusTextColorClass(status: string): string {
  const norm = normalizeEpicWorkflowStatus(status);
  const upper = (status || '').toUpperCase();

  if (norm === 'PENDING' || norm === 'TO DO' || upper.includes('PENDING') || upper.includes('TO DO')) {
    return 'text-[#8B4513] font-bold'; // Brown
  }
  if (norm === 'RELEASED' || upper.includes('RELEASED')) {
    return 'text-[#2E7D32] font-bold'; // Green
  }
  if (norm === 'R4GOLIVE' || upper.includes('R4G')) {
    return 'text-[#689F38] font-bold'; // Lime
  }
  if (norm === 'IN_PROGRESS' || upper.includes('IN PROGRESS') || upper.includes('PROGRESS')) {
    return 'text-[#0D47A1] font-bold'; // Blue navy
  }
  return 'text-black font-bold';
}

export default function ReportsPage() {
  const jiraViewIssueBaseUrl = useJiraViewIssueUrl();

  const [loadingMeta, setLoadingMeta] = React.useState(true);
  const [metaError, setMetaError] = React.useState<string | null>(null);

  const [domains, setDomains] = React.useState<Array<{ domainCode: string; domainName: string; id: number }>>([]);
  const [projects, setProjects] = React.useState<Array<{ domainId: number | null; id: number; projectName: string; sourceProjectKey: string }>>([]);
  const [components, setComponents] = React.useState<Array<{ componentName: string; id: number; projectKey: string }>>([]);
  const [layerDates, setLayerDates] = React.useState<string[]>([]);

  // Filter States
  const [selectedDomainId, setSelectedDomainId] = React.useState<string>('ALL');
  const [selectedProjectKey, setSelectedProjectKey] = React.useState<string>('');
  const [selectedComponent, setSelectedComponent] = React.useState<string>('ALL');
  const [selectedLayerAnchor, setSelectedLayerAnchor] = React.useState<string>('');
  const [compareLayerAnchor, setCompareLayerAnchor] = React.useState<string>('');

  // Collapsible Advanced Config
  const [advancedConfigOpen, setAdvancedConfigOpen] = React.useState(false);

  // Epic Browser Modal State
  const [browsingEpicKey, setBrowsingEpicKey] = React.useState<string | null>(null);

  // 3 Date Filters
  const [createdDateFrom, setCreatedDateFrom] = React.useState<string>('');
  const [startDateFrom, setStartDateFrom] = React.useState<string>('');
  const [releasedDateFrom, setReleasedDateFrom] = React.useState<string>('');

  // Report Result State
  const [generating, setGenerating] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ReportResult | null>(null);
  const [compareReport, setCompareReport] = React.useState<ReportResult | null>(null);

  // Fetch Metadata
  React.useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch('/api/reports');
        if (!res.ok) {
          const errData = await res.json();
          setMetaError(errData.error || 'Quyền truy cập bị từ chối.');
          setLoadingMeta(false);
          return;
        }
        const data = await res.json();
        setDomains(data.domains || []);
        setProjects(data.projects || []);
        setComponents(data.components || []);
        const layers = data.layerDates || [];
        setLayerDates(layers);

        // Default select latest layer (index 0)
        if (layers.length > 0) {
          setSelectedLayerAnchor(layers[0]);
        }
        // Default select first project if available
        if (data.projects && data.projects.length > 0) {
          setSelectedProjectKey(data.projects[0].sourceProjectKey);
        }
      } catch (err: unknown) {
        setMetaError(err instanceof Error ? err.message : 'Không thể kết nối máy chủ.');
      } finally {
        setLoadingMeta(false);
      }
    }

    loadMeta();
  }, []);

  // Filter projects by domain
  const filteredProjects = React.useMemo(() => {
    if (selectedDomainId === 'ALL') return projects;
    const domIdNum = Number(selectedDomainId);
    return projects.filter((p) => p.domainId === domIdNum);
  }, [projects, selectedDomainId]);

  // Derived effective project key that automatically syncs with domain filter
  const effectiveProjectKey = React.useMemo(() => {
    if (filteredProjects.length === 0) return '';
    if (filteredProjects.some((p) => p.sourceProjectKey === selectedProjectKey)) {
      return selectedProjectKey;
    }
    return filteredProjects[0].sourceProjectKey;
  }, [filteredProjects, selectedProjectKey]);

  // Filter components by project
  const filteredComponents = React.useMemo(() => {
    if (!effectiveProjectKey) return [];
    const projKeyLower = effectiveProjectKey.toLowerCase();
    return components.filter((c) => c.projectKey.toLowerCase() === projKeyLower);
  }, [components, effectiveProjectKey]);

  /**
   * Single layer selection rule:
   * 1. Default selects newest layer (index 0).
   * 2. User can pick exactly 1 layer (older or the newest) — clicking a layer replaces the previous pick.
   * 3. Report data always drills down from the selected layer through all older layers
   *    (layerDates is sorted newest-first, so this is layerDates.slice(selectedIndex)).
   */
  const handleSelectLayer = (index: number) => {
    setSelectedLayerAnchor(layerDates[index]);
  };

  // "Chọn lớp dữ liệu" only shows the newest 5 as quick-pick chips — everything older lives in a
  // dropdown right after them (see the "Lớp dữ liệu cũ hơn…" select below) so any recorded layer
  // stays reachable without the button row growing unbounded (getReportLayerDates now returns up
  // to 365 dates, not just 7).
  const RECENT_LAYER_CHIP_COUNT = 5;
  const recentLayerDates = React.useMemo(() => layerDates.slice(0, RECENT_LAYER_CHIP_COUNT), [layerDates]);
  const olderLayerDates = React.useMemo(() => layerDates.slice(RECENT_LAYER_CHIP_COUNT), [layerDates]);

  // Full set of layer dates actually sent to the report query: the selected layer plus every older layer,
  // so the backend's fallback logic can drill down for epics missing from the selected snapshot.
  const selectedLayers = React.useMemo(() => {
    if (!selectedLayerAnchor) return [];
    const anchorIdx = layerDates.indexOf(selectedLayerAnchor);
    if (anchorIdx === -1) return [];
    return layerDates.slice(anchorIdx);
  }, [layerDates, selectedLayerAnchor]);

  // Full set of compare layer dates sent to the report query if comparison is active.
  const compareLayers = React.useMemo(() => {
    if (!compareLayerAnchor) return [];
    const anchorIdx = layerDates.indexOf(compareLayerAnchor);
    if (anchorIdx === -1) return [];
    return layerDates.slice(anchorIdx);
  }, [layerDates, compareLayerAnchor]);

  // "As of" date pinning every FAIL/EARLY/LATE/anomaly calculation to the selected layer instead of
  // the real wall-clock date — only needed when the anchor is an OLDER layer than the newest
  // (index 0); picking the newest layer (or none yet) keeps the default real-today evaluation.
  const asOfDate = layerDates.indexOf(selectedLayerAnchor) > 0 ? selectedLayerAnchor : undefined;
  const compareAsOfDate = layerDates.indexOf(compareLayerAnchor) > 0 ? compareLayerAnchor : undefined;

  const handleResetFilter = () => {
    setSelectedDomainId('ALL');
    if (projects.length > 0) {
      setSelectedProjectKey(projects[0].sourceProjectKey);
    }
    setSelectedComponent('ALL');
    setCreatedDateFrom('');
    setStartDateFrom('');
    setReleasedDateFrom('');
    if (layerDates.length > 0) {
      setSelectedLayerAnchor(layerDates[0]);
    }
    setCompareLayerAnchor('');
    setReport(null);
    setCompareReport(null);
    setReportError(null);
  };

  const handleGenerateReport = async () => {
    if (!effectiveProjectKey) {
      alert('Vui lòng chọn Dự án!');
      return;
    }
    if (!selectedLayerAnchor || selectedLayers.length === 0) {
      alert('Vui lòng chọn 1 Lớp dữ liệu!');
      return;
    }

    setGenerating(true);
    setReportError(null);

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asOfDate,
          compareAsOfDate,
          compareLayerDates: compareLayers.length > 0 ? compareLayers : undefined,
          component: selectedComponent,
          createdDateFrom: createdDateFrom || undefined,
          domainId: selectedDomainId !== 'ALL' ? Number(selectedDomainId) : undefined,
          projectKey: effectiveProjectKey,
          releasedDateFrom: releasedDateFrom || undefined,
          selectedLayerDates: selectedLayers,
          startDateFrom: startDateFrom || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setReportError(data.error || 'Tạo báo cáo thất bại.');
      } else {
        setReport(data.report);
        setCompareReport(data.compareReport || null);
      }
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo báo cáo.');
    } finally {
      setGenerating(false);
    }
  };

  if (loadingMeta) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-4 border-[#1463f7] border-t-transparent" />
          <p className="text-xs font-medium text-gray-600">Đang tải cấu hình bộ lọc Báo cáo...</p>
        </div>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="p-6">
        <div className="rounded-none border border-black bg-gray-100 p-6 text-center text-black max-w-md mx-auto">
          <Warning className="size-6 mx-auto mb-2 text-black" weight="bold" />
          <h2 className="text-base font-bold">Truy cập bị từ chối</h2>
          <p className="text-xs mt-1 text-gray-700">{metaError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 text-black bg-white">
      {/* Banner System */}
      <InfoBannerDisplay pathname="/reports" />

      {/* Printable CSS style override */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
          }
          nav, sidebar, header, .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* FILTER PANEL - Darker Background to distinguish from White Report below */}
      <div className="no-print rounded-none border-2 border-slate-400 bg-slate-200 p-5 space-y-4 shadow-sm text-black">
        <div className="flex items-center justify-between border-b border-slate-300 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center bg-[#1463f7] text-white rounded-none">
              <Bandaids className="size-4" weight="bold" />
            </div>
            <div>
              <h1 className="text-base font-bold text-black">Báo cáo Epic (beta 2)</h1>
              <p className="text-[11px] text-gray-700 font-medium">Lựa chọn lớp dữ liệu và các điều kiện lọc</p>
            </div>
          </div>
          <span className="bg-black text-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            TTM Monitor
          </span>
        </div>

        {/* Row 1 Filters: Domain, Project, Component */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">1. Domain Nghiệp vụ</label>
            <select
              value={selectedDomainId}
              onChange={(e) => setSelectedDomainId(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-2 text-xs outline-none focus:border-[#1463f7] font-medium"
            >
              <option value="ALL">-- Tất cả Domain --</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domainCode} - {d.domainName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">
              2. Dự án (Project Key) <span className="text-[#1463f7]">*</span>
            </label>
            <select
              value={effectiveProjectKey}
              onChange={(e) => setSelectedProjectKey(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-2 text-xs outline-none focus:border-[#1463f7] font-medium"
              required
            >
              {filteredProjects.length === 0 ? (
                <option value="">Không có dự án nào</option>
              ) : (
                filteredProjects.map((p) => (
                  <option key={p.id} value={p.sourceProjectKey}>
                    [{p.sourceProjectKey}] {p.projectName}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">3. Component (Tùy chọn)</label>
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-2 text-xs outline-none focus:border-[#1463f7] font-medium"
              disabled={!effectiveProjectKey}
            >
              <option value="ALL">-- Tất cả Component --</option>
              {filteredComponents.map((c) => (
                <option key={c.id} value={c.componentName}>
                  {c.componentName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2 Filters: 3 Date Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-300 pt-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">
              4. Epic tạo mới từ (Created Date &ge;)
            </label>
            <input
              type="date"
              value={createdDateFrom}
              onChange={(e) => setCreatedDateFrom(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">
              5. Epic start date từ (Start CNTT / T1 &ge;)
            </label>
            <input
              type="date"
              value={startDateFrom}
              onChange={(e) => setStartDateFrom(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">
              6. Epic golive sau (Due Date &ge;)
            </label>
            <input
              type="date"
              value={releasedDateFrom}
              onChange={(e) => setReleasedDateFrom(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono"
            />
          </div>
        </div>

        {/* Advanced Config Section Toggle */}
        <div className="border-t border-slate-300 pt-3">
          <button
            type="button"
            onClick={() => setAdvancedConfigOpen(!advancedConfigOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-black hover:text-[#1463f7] transition-colors"
          >
            {advancedConfigOpen ? (
              <CaretDown className="size-4 text-[#1463f7]" weight="bold" />
            ) : (
              <CaretRight className="size-4 text-[#1463f7]" weight="bold" />
            )}
            <span>Cấu hình nâng cao...</span>
          </button>

          {advancedConfigOpen && (
            <div className="mt-3 space-y-3 pl-2 border-l-2 border-[#1463f7] pt-1">
              {/* Item 7. Lịch sử báo cáo */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-black">
                    7. Lịch sử báo cáo (Lớp dữ liệu) <span className="text-[#1463f7]">*</span>
                  </label>
                  <span className="text-[10px] text-gray-700 font-medium">Chọn 1 lớp dữ liệu, dữ liệu sẽ tự động drill xuống các lớp cũ hơn nếu thiếu.</span>
                </div>

                {layerDates.length === 0 ? (
                  <p className="text-[11px] text-gray-600">Chưa có lớp dữ liệu nào trong hệ thống.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {recentLayerDates.map((layer, idx) => {
                      const isSelected = layer === selectedLayerAnchor;

                      return (
                        <button
                          key={layer}
                          type="button"
                          onClick={() => handleSelectLayer(idx)}
                          title={`Chọn lớp dữ liệu ${layer} (drill xuống các lớp cũ hơn)`}
                          className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#1463f7] bg-[#1463f7] text-white'
                              : 'border-slate-400 bg-white text-gray-800 hover:border-black'
                          }`}
                        >
                          {isSelected && <Check className="size-3.5" weight="bold" />}
                          <span>{layer}</span>
                          {idx === 0 && <span className="bg-black text-white px-1 text-[9px] uppercase">Mới nhất</span>}
                        </button>
                      );
                    })}
                    {olderLayerDates.length > 0 && (
                      <select
                        className={`rounded-none border px-2 py-1.5 text-xs font-bold font-mono cursor-pointer ${
                          olderLayerDates.includes(selectedLayerAnchor) ? 'border-[#1463f7] text-[#1463f7]' : 'border-slate-400 text-gray-800'
                        }`}
                        value={olderLayerDates.includes(selectedLayerAnchor) ? selectedLayerAnchor : ''}
                        onChange={(event) => { if (event.target.value) setSelectedLayerAnchor(event.target.value); }}
                        title="Chọn 1 lớp dữ liệu cũ hơn (ngoài 5 lớp gần nhất) — drill xuống các lớp cũ hơn nữa"
                      >
                        <option value="">Lớp dữ liệu cũ hơn…</option>
                        {olderLayerDates.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Item 8. So sánh với Lớp dữ liệu */}
              <div className="pt-2 border-t border-slate-300">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-black">
                    8. So sánh với Lớp dữ liệu
                  </label>
                  <span className="text-[10px] text-gray-700 font-medium">Mặc định không so sánh. Chọn 1 lớp dữ liệu để so sánh chi tiết.</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => setCompareLayerAnchor('')}
                      title="Mặc định: Không so sánh dữ liệu với lớp khác"
                      className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                        !compareLayerAnchor
                          ? 'border-[#1463f7] bg-[#1463f7] text-white'
                          : 'border-slate-400 bg-white text-gray-800 hover:border-black'
                      }`}
                    >
                      {!compareLayerAnchor && <Check className="size-3.5" weight="bold" />}
                      <span>Không so sánh</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {recentLayerDates.map((layer, idx) => {
                      const isSelected = layer === compareLayerAnchor;

                      return (
                        <button
                          key={layer}
                          type="button"
                          onClick={() => setCompareLayerAnchor(layer)}
                          title={`So sánh với lớp dữ liệu ${layer}`}
                          className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                            isSelected
                              ? 'border-[#1463f7] bg-[#1463f7] text-white'
                              : 'border-slate-400 bg-white text-gray-800 hover:border-black'
                          }`}
                        >
                          {isSelected && <Check className="size-3.5" weight="bold" />}
                          <span>{layer}</span>
                          {idx === 0 && <span className="bg-black text-white px-1 text-[9px] uppercase">Mới nhất</span>}
                        </button>
                      );
                    })}
                    {olderLayerDates.length > 0 && (
                      <select
                        className={`rounded-none border px-2 py-1.5 text-xs font-bold font-mono cursor-pointer ${
                          olderLayerDates.includes(compareLayerAnchor) ? 'border-[#1463f7] text-[#1463f7]' : 'border-slate-400 text-gray-800'
                        }`}
                        value={olderLayerDates.includes(compareLayerAnchor) ? compareLayerAnchor : ''}
                        onChange={(event) => { if (event.target.value) setCompareLayerAnchor(event.target.value); }}
                        title="So sánh với 1 lớp dữ liệu cũ hơn (ngoài 5 lớp gần nhất)"
                      >
                        <option value="">Lớp dữ liệu cũ hơn…</option>
                        {olderLayerDates.map((layer) => <option key={layer} value={layer}>{layer}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Generate Report & Reset Submit Buttons */}
        <div className="flex items-center justify-between border-t border-slate-300 pt-3">
          <p className="text-[11px] text-gray-800 font-medium">
            Đã chọn dự án: <strong className="text-black">{effectiveProjectKey || 'Chưa chọn'}</strong> | Lớp chính (Mục 7): <strong className="text-[#1463f7]">{selectedLayerAnchor || 'Chưa chọn'}</strong>
            {compareLayerAnchor ? (
              <> | So sánh với (Mục 8): <strong className="text-slate-800">{compareLayerAnchor}</strong></>
            ) : (
              <> | <span className="text-gray-600 font-semibold">Không so sánh</span></>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilter}
              className="flex items-center gap-1.5 rounded-none border border-slate-400 bg-white px-4 py-2.5 text-xs font-bold text-black transition-all hover:bg-slate-300 hover:border-black"
            >
              <ArrowsClockwise className="size-4" weight="bold" />
              <span>Đặt lại</span>
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={generating || !effectiveProjectKey || selectedLayers.length === 0}
              className="flex items-center gap-2 rounded-none bg-[#1463f7] px-6 py-2.5 text-xs font-bold text-white shadow-none transition-all hover:bg-black disabled:opacity-50"
            >
              <FileText className="size-4" weight="bold" />
              <span>{generating ? 'Đang tổng hợp dữ liệu...' : 'Tạo báo cáo'}</span>
            </button>
          </div>
        </div>
      </div>

      {reportError && (
        <div className="no-print rounded-none border border-black bg-gray-100 p-3 text-xs font-semibold text-black flex items-center gap-2">
          <Warning className="size-4 shrink-0 text-[#1463f7]" weight="bold" />
          <span>{reportError}</span>
        </div>
      )}

      {/* REPORT DOCUMENT VIEW */}
      {report && (
        <div className="print-container space-y-5 rounded-none border-2 border-black bg-white p-6 text-black shadow-lg">
          {/* Actions Bar (Print / PDF) */}
          <div className="no-print flex items-center justify-between border-b border-gray-300 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-black">
              <CheckCircle className="size-4 text-[#1463f7]" weight="fill" />
              <span>Báo cáo đã tổng hợp xong (Bấm mã Epic để Duyệt Epic hoặc xem Jira)</span>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-none bg-[#1463f7] px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-black"
            >
              <Printer className="size-4" weight="bold" />
              <span>In / Xuất PDF Báo Cáo</span>
            </button>
          </div>

          {/* REPORT HEADER */}
          <div className="border-b-2 border-black pb-4 text-center space-y-1.5">
            <div className="flex items-center justify-center gap-2">
              <div className="grid size-8 place-items-center bg-[#1463f7] text-white rounded-none">
                <Pulse className="size-5" weight="bold" />
              </div>
              <span className="text-base font-extrabold tracking-tight text-black">TTM MONITOR SYSTEM</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-black uppercase">BÁO CÁO EPIC DỰ ÁN</h1>
            <p className="text-[10px] text-gray-500">Thời gian trích xuất hệ thống: {new Date(report.evaluatedAt).toLocaleString('vi-VN')}</p>
          </div>

          {report.asOfDate && (
            <div className="rounded-none border px-3 py-2 text-xs font-bold" style={{ background: '#fff7e6', borderColor: '#f0c36d', color: '#7a5200' }}>
              Đang xem dữ liệu &amp; đánh giá cảnh báo tại thời điểm {report.asOfDate.split('-').reverse().join('/')} (không phải hôm nay thực tế).
            </div>
          )}
          {compareReport?.asOfDate && (
            <div className="rounded-none border px-3 py-2 text-xs font-bold" style={{ background: '#fff7e6', borderColor: '#f0c36d', color: '#7a5200' }}>
              Báo cáo so sánh đang đánh giá cảnh báo tại thời điểm {compareReport.asOfDate.split('-').reverse().join('/')} (không phải hôm nay thực tế).
            </div>
          )}

          {/* 2-COLUMN METADATA BLOCK */}
          <div className="rounded-none border border-black overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-300">
              {/* Column 1 */}
              <div className="divide-y divide-gray-300">
                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    THỜI GIAN THỐNG KÊ
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex flex-col justify-center">
                    <div>
                      <span className="text-[#1463f7]">Lớp chính (Mục 7):</span> Từ {report.minLayerDate} đến {report.maxLayerDate} ({report.layerDates.length} lớp)
                    </div>
                    {compareReport && (
                      <div className="mt-1 pt-1 border-t border-gray-200">
                        <span className="text-slate-800">Lớp so sánh (Mục 8):</span> Từ {compareReport.minLayerDate} đến {compareReport.maxLayerDate} ({compareReport.layerDates.length} lớp)
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    DOMAIN NGHIỆP VỤ
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex items-center">
                    {report.domainName}
                  </div>
                </div>

                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    DỰ ÁN (PROJECT)
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-[#1463f7] flex items-center">
                    [{report.projectKey}] {report.projectName}
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="divide-y divide-gray-300">
                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    COMPONENT
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex items-center">
                    {report.componentName}
                  </div>
                </div>

                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    PM / SM ĐẠI DIỆN
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex items-center">
                    {report.pmSmNames}
                  </div>
                </div>

                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    NGÀY LẬP BÁO CÁO
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex items-center">
                    {new Date(report.evaluatedAt).toLocaleDateString('vi-VN')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SUMMARY KPI CARDS BLOCK (6 Cards Grid) */}
          <div className="space-y-1">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">TỔNG RELEASED</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalReleasedCount}`}>{report.totalReleasedCount}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalReleasedCount}`}>{compareReport.totalReleasedCount}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-black mt-0.5">{report.totalReleasedCount}</p>
                )}
              </div>

              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">ĐẠT TTM</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalPassedCount}`}>{report.totalPassedCount}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalPassedCount}`}>{compareReport.totalPassedCount}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-[#1463f7] mt-0.5">{report.totalPassedCount}</p>
                )}
              </div>

              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">FAIL TTM</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalFailedCount}`}>{report.totalFailedCount}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalFailedCount}`}>{compareReport.totalFailedCount}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-black mt-0.5">{report.totalFailedCount}</p>
                )}
              </div>

              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">EPIC IN PO</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalInPoCount}`}>{report.totalInPoCount}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalInPoCount}`}>{compareReport.totalInPoCount}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-[#1463f7] mt-0.5">{report.totalInPoCount}</p>
                )}
              </div>

              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">EPIC PENDING</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalPendingCount || 0}`}>{report.totalPendingCount || 0}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalPendingCount || 0}`}>{compareReport.totalPendingCount || 0}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-[#8B4513] mt-0.5">{report.totalPendingCount || 0}</p>
                )}
              </div>

              <div className="rounded-none border border-gray-300 bg-gray-50 p-2 text-center">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">SAI LỆCH DỮ LIỆU</p>
                {compareReport ? (
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-base font-extrabold text-[#1463f7]" title={`Lớp chính: ${report.totalAnomalyCount}`}>{report.totalAnomalyCount}</span>
                    <span className="text-gray-400 font-bold">/</span>
                    <span className="text-base font-extrabold text-slate-800" title={`Lớp so sánh: ${compareReport.totalAnomalyCount}`}>{compareReport.totalAnomalyCount}</span>
                  </div>
                ) : (
                  <p className="text-lg font-extrabold text-gray-700 mt-0.5">{report.totalAnomalyCount}</p>
                )}
              </div>
            </div>
            {compareReport && (
              <p className="text-[10px] text-gray-500 text-right italic">
                * Định dạng số liệu: <span className="text-[#1463f7] font-bold">Lớp chính (Mục 7)</span> / <span className="text-slate-800 font-bold">Lớp so sánh (Mục 8)</span>
              </p>
            )}
          </div>

          {/* SECTION 1: RELEASED EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="1. DANH SÁCH CÁC EPIC ĐÃ RELEASED TRONG GIAI ĐOẠN LỰA CHỌN"
            totalCount={report.totalReleasedCount}
            items={report.releasedEpics}
            compareItems={compareReport ? compareReport.releasedEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalReleasedCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            customHeader="Thời gian Released / TTM"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px]">
                <div className="font-mono">{item.releasedDate || '-'}</div>
                {item.actualTtmDays !== null && (
                  <div className="text-[11px] font-bold text-[#1463f7]">{item.actualTtmDays} ngày làm việc</div>
                )}
              </td>
            )}
          />

          {/* SECTION 2: PASSED TTM EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="2. DANH SÁCH CÁC EPIC ĐẠT TTM-CNTT VÀ TTM-E2E"
            totalCount={report.totalPassedCount}
            items={report.passedEpics}
            compareItems={compareReport ? compareReport.passedEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalPassedCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            customHeader="Loại đạt"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-bold text-[#1463f7]">
                <span>{item.passType || 'Đạt TTM'}</span>
              </td>
            )}
          />

          {/* SECTION 3: FAILED TTM EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="3. DANH SÁCH CÁC EPIC FAIL TTM-CNTT VÀ TTM-E2E"
            totalCount={report.totalFailedCount}
            items={report.failedEpics}
            compareItems={compareReport ? compareReport.failedEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalFailedCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            isFailTable={true}
            customHeader="Loại Fail / Chi tiết"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-bold text-black">
                <span>{item.failType || 'Fail TTM'}</span>
              </td>
            )}
          />

          {/* SECTION 4: EPIC IN PO DEDICATED TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="4. DANH SÁCH CÁC EPIC IN PO (TO DO, IN PO)"
            totalCount={report.totalInPoCount}
            items={report.inPoEpics}
            compareItems={compareReport ? compareReport.inPoEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalInPoCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            customHeader="Phân loại Trạng thái"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-bold">
                <span className={getStatusTextColorClass(item.status)}>{item.status}</span>
              </td>
            )}
          />

          {/* SECTION 5: DATA ANOMALY EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="5. DANH SÁCH CÁC EPIC CÓ SAI LỆCH DỮ LIỆU"
            totalCount={report.totalAnomalyCount}
            items={report.anomalyEpics}
            compareItems={compareReport ? compareReport.anomalyEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalAnomalyCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            customHeader="Chi tiết dữ liệu sai lệch"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-medium text-gray-700">
                <ul className="list-disc pl-3 space-y-0.5">
                  {item.anomalyDetails.map((det, idx) => (
                    <li key={idx}>{det}</li>
                  ))}
                </ul>
              </td>
            )}
          />

          {/* SECTION 6: PENDING EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={(epicKey) => setBrowsingEpicKey(epicKey)}
            title="6. DANH SÁCH CÁC EPIC PENDING"
            totalCount={report.totalPendingCount || 0}
            items={report.pendingEpics || []}
            compareItems={compareReport ? compareReport.pendingEpics : undefined}
            compareTotalCount={compareReport ? compareReport.totalPendingCount : undefined}
            primaryLayerLabel={report.maxLayerDate}
            compareLayerLabel={compareReport?.maxLayerDate}
            customHeader="Phân loại Trạng thái"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-bold text-[#8B4513]">
                <span>{item.status}</span>
              </td>
            )}
          />

          {/* COMPARISON CHARTS ROW (WHEN ITEM 8 IS SELECTED) */}
          {compareReport && (
            <ReportComparisonChartsRow
              report={report}
              compareReport={compareReport}
            />
          )}

          {/* PAGE BOTTOM FOOTER */}
          <div className="border-t-2 border-black pt-4 pb-2 text-center mt-6">
            <p className="text-xs font-bold text-black uppercase tracking-wide">
              Phòng QLDA-TKTN, Trung tâm Đảm bảo chất lượng, Khối CNTT.
            </p>
          </div>
        </div>
      )}

      {/* EPIC BROWSER MODAL (POPUP DUYỆT EPIC) */}
      {browsingEpicKey && (
        <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
      )}
    </div>
  );
}

interface ReportSectionBlockSquareProps {
  compareItems?: ReportEpicItem[];
  compareLayerLabel?: string;
  compareTotalCount?: number;
  customHeader: string;
  isFailTable?: boolean;
  items: ReportEpicItem[];
  jiraViewIssueBaseUrl: string;
  onOpenEpicBrowser: (epicKey: string) => void;
  primaryLayerLabel?: string;
  renderCustomCell: (item: ReportEpicItem) => React.ReactNode;
  title: string;
  totalCount: number;
}

function ReportSectionBlockSquare({
  compareItems,
  compareLayerLabel,
  compareTotalCount,
  customHeader,
  isFailTable,
  items,
  jiraViewIssueBaseUrl,
  onOpenEpicBrowser,
  primaryLayerLabel,
  renderCustomCell,
  title,
  totalCount,
}: ReportSectionBlockSquareProps) {
  const [collapsed, setCollapsed] = React.useState(true);
  const isComparing = compareItems !== undefined;

  return (
    <div className="rounded-none border border-black overflow-hidden">
      {/* Header Bar - Light Background, Clickable to Toggle Collapsed State */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="bg-slate-200 text-black px-3 py-2 font-bold text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 cursor-pointer select-none border-b border-slate-300 hover:bg-slate-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <CaretRight className="size-4 text-black shrink-0" weight="bold" /> : <CaretDown className="size-4 text-black shrink-0" weight="bold" />}
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isComparing ? (
            <div className="flex items-center gap-1.5">
              <span className="bg-[#1463f7] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
                Lớp chính: {totalCount}
              </span>
              <span className="bg-slate-800 text-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
                Lớp so sánh: {compareTotalCount ?? 0}
              </span>
            </div>
          ) : (
            <span className="bg-[#1463f7] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
              Tổng số: {totalCount} Epic
            </span>
          )}
        </div>
      </div>

      {/* Table Content Container - Always printed even if collapsed on screen */}
      <div className={collapsed ? 'hidden print:block' : 'block'}>
        {isComparing ? (
          /* COMPARISON MODE: 2 VERTICAL PANES (SIDE-BY-SIDE) */
          <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-black bg-white">
            {/* Left Pane: Layer chosen in Item 7 */}
            <div className="min-w-0">
              <div className="bg-blue-100 border-b border-gray-300 px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-[#1463f7]">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 bg-[#1463f7]" />
                  <span>BÊN TRÁI: LỚP CHÍNH ({primaryLayerLabel || 'Mục 7'})</span>
                </div>
                <span className="bg-[#1463f7] text-white px-1.5 py-0.5 text-[10px] font-extrabold">
                  {totalCount} Epic
                </span>
              </div>
              <SingleReportTable
                customHeader={customHeader}
                isFailTable={isFailTable}
                items={items}
                jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
                onOpenEpicBrowser={onOpenEpicBrowser}
                renderCustomCell={renderCustomCell}
              />
            </div>

            {/* Right Pane: Layer chosen in Item 8 */}
            <div className="min-w-0">
              <div className="bg-slate-200 border-b border-gray-300 px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block size-2.5 bg-slate-700" />
                  <span>BÊN PHẢI: LỚP SO SÁNH ({compareLayerLabel || 'Mục 8'})</span>
                </div>
                <span className="bg-slate-800 text-white px-1.5 py-0.5 text-[10px] font-extrabold">
                  {compareTotalCount ?? 0} Epic
                </span>
              </div>
              <SingleReportTable
                customHeader={customHeader}
                isFailTable={isFailTable}
                items={compareItems}
                jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
                onOpenEpicBrowser={onOpenEpicBrowser}
                renderCustomCell={renderCustomCell}
              />
            </div>
          </div>
        ) : (
          /* STANDARD MODE: FULL WIDTH TABLE */
          <SingleReportTable
            customHeader={customHeader}
            isFailTable={isFailTable}
            items={items}
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            onOpenEpicBrowser={onOpenEpicBrowser}
            renderCustomCell={renderCustomCell}
          />
        )}
      </div>
    </div>
  );
}

interface SingleReportTableProps {
  customHeader: string;
  isFailTable?: boolean;
  items: ReportEpicItem[];
  jiraViewIssueBaseUrl: string;
  onOpenEpicBrowser: (epicKey: string) => void;
  renderCustomCell: (item: ReportEpicItem) => React.ReactNode;
}

function SingleReportTable({
  customHeader,
  isFailTable,
  items,
  jiraViewIssueBaseUrl,
  onOpenEpicBrowser,
  renderCustomCell,
}: SingleReportTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-3 text-center text-[11px] text-gray-500 bg-gray-50">
        Không có Epic nào trong danh sách này.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px] border-collapse min-w-[620px]">
        <thead>
          <tr className="border-b border-gray-300 bg-gray-100 text-black font-bold select-none">
            <th className="px-2 py-1.5 w-7 text-center border-r border-gray-300">STT</th>
            <th className="px-2 py-1.5 w-14 border-r border-gray-300">Project</th>
            <th className="px-2 py-1.5 max-w-[220px] border-r border-gray-300">Epic Key / Summary</th>
            <th className="px-2 py-1.5 w-20 border-r border-gray-300">Status</th>
            <th className="px-2 py-1.5 min-w-[86px] whitespace-nowrap border-r border-gray-300">Start E2E</th>
            <th className="px-2 py-1.5 min-w-[86px] whitespace-nowrap border-r border-gray-300">Start CNTT</th>
            <th className="px-2 py-1.5 min-w-[86px] whitespace-nowrap border-r border-gray-300">R4G Date</th>
            <th className="px-2 py-1.5 min-w-[86px] whitespace-nowrap border-r border-gray-300">Released Date</th>
            <th className="px-2 py-1.5">{customHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item, idx) => {
            const jiraHref = jiraViewIssueBaseUrl
              ? `${jiraViewIssueBaseUrl}${encodeURIComponent(item.epicKey)}`
              : null;

            return (
              <tr key={item.epicKey} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 text-center font-mono text-gray-500 border-r border-gray-200">{idx + 1}</td>
                <td className="px-2 py-1.5 font-mono font-bold text-black border-r border-gray-200">{item.projectKey}</td>

                {/* COMBINED EPIC KEY WITH CLICK TO OPEN DUYỆT EPIC POPUP (LINE 1) & SUMMARY (LINE 2) */}
                <td className="px-2 py-1.5 border-r border-gray-200">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenEpicBrowser(item.epicKey)}
                      className="font-mono font-bold text-[#1463f7] hover:underline text-[11px] text-left"
                      title={`Duyệt Epic — ${item.epicKey}`}
                    >
                      {item.epicKey}
                    </button>
                    {jiraHref && (
                      <a
                        href={jiraHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-[#1463f7]"
                        title="Mở Epic trên Jira (cửa sổ mới)"
                      >
                        <ArrowSquareOut className="size-3 shrink-0" weight="bold" />
                      </a>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-600 truncate max-w-[220px]" title={item.summary}>
                    {item.summary}
                  </div>
                </td>

                {/* STATUS COLUMN WITH SPECIFIC TEXT COLOR RULES */}
                <td className={`px-2 py-1.5 font-bold border-r border-gray-200 ${getStatusTextColorClass(item.status)}`}>
                  {item.status}
                </td>

                {/* Start E2E with CaretRight icon per standard */}
                <td className="px-2 py-1.5 font-mono whitespace-nowrap border-r border-gray-200">
                  {item.ideaApprovedDate ? (
                    <span className="inline-flex items-center gap-1">
                      <CaretRight className="size-3 text-[#64748b] shrink-0" weight="bold" />
                      <span>{item.ideaApprovedDate}</span>
                    </span>
                  ) : '-'}
                </td>

                {/* Start CNTT with CaretLineRight icon per standard */}
                <td className="px-2 py-1.5 font-mono whitespace-nowrap border-r border-gray-200">
                  {item.startDate ? (
                    <span className="inline-flex items-center gap-1">
                      <CaretLineRight className="size-3 text-[#64748b] shrink-0" weight="bold" />
                      <span>{item.startDate}</span>
                    </span>
                  ) : '-'}
                </td>

                {/* R4G Date with Checks icon per standard */}
                <td className="px-2 py-1.5 font-mono whitespace-nowrap border-r border-gray-200">
                  {item.r4gDate ? (
                    <span className="inline-flex items-center gap-1">
                      <Checks className="size-3 text-[#000000] shrink-0" weight="bold" />
                      <span>{item.r4gDate}</span>
                    </span>
                  ) : isFailTable ? (
                    <span className="text-red-700 font-semibold text-[11px]">Thiếu thông tin</span>
                  ) : (
                    '-'
                  )}
                </td>

                {/* Released Date with Checks icon per standard */}
                <td className="px-2 py-1.5 font-mono whitespace-nowrap border-r border-gray-200">
                  {item.releasedDate ? (
                    <span className="inline-flex items-center gap-1">
                      <Checks className="size-3 text-[#000000] shrink-0" weight="bold" />
                      <span>{item.releasedDate}</span>
                    </span>
                  ) : isFailTable ? (
                    <span className="text-red-700 font-semibold text-[11px]">Thiếu thông tin</span>
                  ) : (
                    '-'
                  )}
                </td>

                {renderCustomCell(item)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ComparisonChartCardProps {
  compareCount: number;
  compareLabel: string;
  primaryCount: number;
  primaryLabel: string;
  title: string;
}

function ComparisonChartCard({
  compareCount,
  compareLabel,
  primaryCount,
  primaryLabel,
  title,
}: ComparisonChartCardProps) {
  const maxVal = Math.max(primaryCount, compareCount, 1);
  const h1Percent = Math.round((primaryCount / maxVal) * 100);
  const h2Percent = Math.round((compareCount / maxVal) * 100);
  const diff = primaryCount - compareCount;

  return (
    <div className="rounded-none border border-black bg-gray-50 p-2.5 flex flex-col justify-between">
      {/* Title */}
      <div className="border-b border-gray-300 pb-1.5 text-center">
        <h3 className="text-[11px] font-bold text-black uppercase tracking-tight truncate" title={title}>
          {title}
        </h3>
        <div className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold">
          <span className="text-gray-500">Chênh lệch:</span>
          {diff > 0 ? (
            <span className="text-blue-700 font-bold">+{diff}</span>
          ) : diff < 0 ? (
            <span className="text-red-600 font-bold">{diff}</span>
          ) : (
            <span className="text-gray-700 font-bold">0</span>
          )}
        </div>
      </div>

      {/* Column Chart Area */}
      <div className="h-28 flex items-end justify-center gap-4 px-2 pt-2 pb-1 border-b border-gray-200">
        {/* Primary Bar (Mục 7) */}
        <div className="flex flex-col items-center justify-end h-full w-1/2 max-w-[44px]">
          <span className="text-[11px] font-extrabold text-[#1463f7] mb-0.5">{primaryCount}</span>
          <div
            className="w-full bg-[#1463f7] border border-blue-800 transition-all duration-300"
            style={{ height: `${Math.max(primaryCount > 0 ? 6 : 2, h1Percent * 0.78)}%` }}
          />
        </div>

        {/* Compare Bar (Mục 8) */}
        <div className="flex flex-col items-center justify-end h-full w-1/2 max-w-[44px]">
          <span className="text-[11px] font-extrabold text-slate-800 mb-0.5">{compareCount}</span>
          <div
            className="w-full bg-slate-700 border border-slate-900 transition-all duration-300"
            style={{ height: `${Math.max(compareCount > 0 ? 6 : 2, h2Percent * 0.78)}%` }}
          />
        </div>
      </div>

      {/* X-Axis Labels */}
      <div className="flex items-center justify-between pt-1 text-[10px] font-bold">
        <span className="text-[#1463f7] truncate text-center w-1/2" title={`Lớp chính: ${primaryLabel}`}>
          {primaryLabel.length > 5 ? primaryLabel.slice(5) : primaryLabel}
        </span>
        <span className="text-slate-700 truncate text-center w-1/2" title={`Lớp so sánh: ${compareLabel}`}>
          {compareLabel.length > 5 ? compareLabel.slice(5) : compareLabel}
        </span>
      </div>
    </div>
  );
}

function ReportComparisonChartsRow({
  compareReport,
  report,
}: {
  compareReport: ReportResult;
  report: ReportResult;
}) {
  const primaryLabel = report.maxLayerDate;
  const compareLabel = compareReport.maxLayerDate;

  return (
    <div className="rounded-none border border-black p-3 bg-white space-y-3 print:break-inside-avoid">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-300 pb-2 gap-2">
        <div className="flex items-center gap-2">
          <ChartBar className="size-4 text-[#1463f7]" weight="bold" />
          <span className="text-xs font-extrabold uppercase text-black">
            BIỂU ĐỒ CỘT SO SÁNH TỔNG SỐ EPIC (MỤC 2, 3, 4, 5)
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-3 bg-[#1463f7] border border-blue-800" />
            <span className="text-gray-700">
              Lớp chính (Mục 7): <strong className="text-[#1463f7]">{primaryLabel}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-3 bg-slate-700 border border-slate-900" />
            <span className="text-gray-700">
              Lớp so sánh (Mục 8): <strong className="text-slate-800">{compareLabel}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 4 Column Charts on the SAME ROW */}
      <div className="grid grid-cols-4 gap-3">
        <ComparisonChartCard
          title="Mục 2: Đạt TTM"
          primaryCount={report.totalPassedCount}
          compareCount={compareReport.totalPassedCount}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
        />
        <ComparisonChartCard
          title="Mục 3: Fail TTM"
          primaryCount={report.totalFailedCount}
          compareCount={compareReport.totalFailedCount}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
        />
        <ComparisonChartCard
          title="Mục 4: Epic In PO"
          primaryCount={report.totalInPoCount}
          compareCount={compareReport.totalInPoCount}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
        />
        <ComparisonChartCard
          title="Mục 5: Sai lệch dữ liệu"
          primaryCount={report.totalAnomalyCount}
          compareCount={compareReport.totalAnomalyCount}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
        />
      </div>
    </div>
  );
}
