'use client';

import * as React from 'react';
import { ArrowSquareOut, ArrowsClockwise, Bandaids, CaretDown, CaretRight, Check, CheckCircle, FileText, Funnel, Printer, Pulse, ShieldCheck, Warning } from '@phosphor-icons/react';
import type { ReportEpicItem, ReportResult } from '@/lib/reports-service';
import { normalizeEpicWorkflowStatus } from '@/lib/ttm-phase-rules';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';

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

export default function AdminReportsPage() {
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
  const [selectedLayers, setSelectedLayers] = React.useState<string[]>([]);

  // 3 New Date Filters
  const [createdDateFrom, setCreatedDateFrom] = React.useState<string>('');
  const [startDateFrom, setStartDateFrom] = React.useState<string>('');
  const [releasedDateFrom, setReleasedDateFrom] = React.useState<string>('');

  // Report Result State
  const [generating, setGenerating] = React.useState(false);
  const [reportError, setReportError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ReportResult | null>(null);

  // Fetch Metadata
  React.useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch('/api/admin/reports');
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

        // Default select latest layer (always selected)
        if (layers.length > 0) {
          setSelectedLayers([layers[0]]);
        }
        // Default select first project if available
        if (data.projects && data.projects.length > 0) {
          setSelectedProjectKey(data.projects[0].sourceProjectKey);
        }
      } catch (err: any) {
        setMetaError(err?.message || 'Không thể kết nối máy chủ.');
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

  // Filter components by project
  const filteredComponents = React.useMemo(() => {
    if (!selectedProjectKey) return [];
    const projKeyLower = selectedProjectKey.toLowerCase();
    return components.filter((c) => c.projectKey.toLowerCase() === projKeyLower);
  }, [components, selectedProjectKey]);

  // Auto update selected project if current is not in filtered list
  React.useEffect(() => {
    if (filteredProjects.length > 0) {
      if (!filteredProjects.some((p) => p.sourceProjectKey === selectedProjectKey)) {
        setSelectedProjectKey(filteredProjects[0].sourceProjectKey);
      }
    } else {
      setSelectedProjectKey('');
    }
  }, [filteredProjects, selectedProjectKey]);

  /**
   * Consecutive layer selection rule:
   * 1. Latest layer (index 0) is ALWAYS selected and cannot be unchecked.
   * 2. Selecting layer at index i automatically selects all layers from 0 to i.
   * 3. Unselecting layer at index i unselects layers from i downwards, keeping 0 to i-1.
   */
  const handleToggleConsecutiveLayer = (index: number) => {
    if (index === 0) return; // Newest layer is always selected!
    const targetLayer = layerDates[index];
    const isAlreadySelected = selectedLayers.includes(targetLayer);

    if (isAlreadySelected) {
      setSelectedLayers(layerDates.slice(0, index));
    } else {
      setSelectedLayers(layerDates.slice(0, index + 1));
    }
  };

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
      setSelectedLayers([layerDates[0]]);
    }
    setReport(null);
    setReportError(null);
  };

  const handleGenerateReport = async () => {
    if (!selectedProjectKey) {
      alert('Vui lòng chọn Dự án!');
      return;
    }
    if (selectedLayers.length === 0) {
      alert('Vui lòng chọn ít nhất 1 Lớp dữ liệu!');
      return;
    }

    setGenerating(true);
    setReportError(null);

    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: selectedComponent,
          createdDateFrom: createdDateFrom || undefined,
          domainId: selectedDomainId !== 'ALL' ? Number(selectedDomainId) : undefined,
          projectKey: selectedProjectKey,
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
      }
    } catch (err: any) {
      setReportError(err?.message || 'Lỗi hệ thống khi tạo báo cáo.');
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
              <h1 className="text-base font-bold text-black">Báo cáo Epic</h1>
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
              value={selectedProjectKey}
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
              disabled={!selectedProjectKey}
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

        {/* Row 2 Filters: 3 New Date Filters (Epic tạo mới từ, Epic start date từ, Epic golive sau) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-300 pt-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-black">
              4. Epic tạo mới từ (Start E2E / T0 &ge;)
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
              6. Epic golive sau
            </label>
            <input
              type="date"
              value={releasedDateFrom}
              onChange={(e) => setReleasedDateFrom(e.target.value)}
              className="w-full rounded-none border border-slate-400 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1463f7] font-mono"
            />
          </div>
        </div>

        {/* Data Layer Dates Selection (Consecutive Rule & Lock Newest) */}
        <div className="border-t border-slate-300 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-black">
              7. Lịch sử báo cáo (Lớp dữ liệu liên tiếp 7 ngày) <span className="text-[#1463f7]">*</span>
            </label>
            <span className="text-[10px] text-gray-700 font-medium">Lớp mới nhất mặc định luôn chọn. Chọn thêm phải liên tiếp.</span>
          </div>

          {layerDates.length === 0 ? (
            <p className="text-[11px] text-gray-600">Chưa có lớp dữ liệu nào trong hệ thống.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {layerDates.map((layer, idx) => {
                const isSelected = selectedLayers.includes(layer);
                const isNewest = idx === 0;

                return (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => handleToggleConsecutiveLayer(idx)}
                    disabled={isNewest}
                    title={isNewest ? 'Lớp dữ liệu mới nhất luôn được chọn mặc định' : `Tích chọn liên tiếp từ mới tới ${layer}`}
                    className={`flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-[#1463f7] bg-[#1463f7] text-white'
                        : 'border-slate-400 bg-white text-gray-800 hover:border-black'
                    } ${isNewest ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
                  >
                    {isSelected && <Check className="size-3.5" weight="bold" />}
                    <span>{layer}</span>
                    {isNewest && <span className="bg-black text-white px-1 text-[9px] uppercase">Bắt buộc</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Generate Report & Reset Submit Buttons */}
        <div className="flex items-center justify-between border-t border-slate-300 pt-3">
          <p className="text-[11px] text-gray-800 font-medium">
            Đã chọn dự án: <strong className="text-black">{selectedProjectKey || 'Chưa chọn'}</strong> | Lớp dữ liệu liên tiếp: <strong className="text-[#1463f7]">{selectedLayers.length} lớp</strong>
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
              disabled={generating || !selectedProjectKey || selectedLayers.length === 0}
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
              <span>Báo cáo đã tổng hợp xong (Bấm mã Epic để mở Jira ở cửa sổ mới)</span>
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

          {/* 2-COLUMN METADATA BLOCK */}
          <div className="rounded-none border border-black overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-300">
              {/* Column 1 */}
              <div className="divide-y divide-gray-300">
                <div className="flex">
                  <div className="w-2/5 bg-gray-100 text-black px-3 py-2 text-[11px] font-extrabold tracking-wide uppercase flex items-center border-r border-gray-300">
                    THỜI GIAN THỐNG KÊ
                  </div>
                  <div className="w-3/5 bg-white px-3 py-2 text-[11px] font-bold text-black flex items-center">
                    Từ {report.minLayerDate} đến {report.maxLayerDate} ({report.layerDates.length} lớp)
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">TỔNG RELEASED</p>
              <p className="text-lg font-extrabold text-black mt-0.5">{report.totalReleasedCount}</p>
            </div>

            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">ĐẠT TTM</p>
              <p className="text-lg font-extrabold text-[#1463f7] mt-0.5">{report.totalPassedCount}</p>
            </div>

            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">FAIL TTM</p>
              <p className="text-lg font-extrabold text-black mt-0.5">{report.totalFailedCount}</p>
            </div>

            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">EPIC IN PO</p>
              <p className="text-lg font-extrabold text-[#1463f7] mt-0.5">{report.totalInPoCount}</p>
            </div>

            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">EPIC PENDING</p>
              <p className="text-lg font-extrabold text-[#8B4513] mt-0.5">{report.totalPendingCount || 0}</p>
            </div>

            <div className="rounded-none border border-gray-300 bg-gray-50 p-2.5 text-center">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">SAI LỆCH DỮ LIỆU</p>
              <p className="text-lg font-extrabold text-gray-700 mt-0.5">{report.totalAnomalyCount}</p>
            </div>
          </div>

          {/* SECTION 1: RELEASED EPICS TABLE */}
          <ReportSectionBlockSquare
            jiraViewIssueBaseUrl={jiraViewIssueBaseUrl}
            title="1. DANH SÁCH CÁC EPIC ĐÃ RELEASED TRONG GIAI ĐOẠN LỰA CHỌN"
            totalCount={report.totalReleasedCount}
            items={report.releasedEpics}
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
            title="2. DANH SÁCH CÁC EPIC ĐẠT TTM-CNTT VÀ TTM-E2E"
            totalCount={report.totalPassedCount}
            items={report.passedEpics}
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
            title="3. DANH SÁCH CÁC EPIC FAIL TTM-CNTT VÀ TTM-E2E"
            totalCount={report.totalFailedCount}
            items={report.failedEpics}
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
            title="4. DANH SÁCH CÁC EPIC IN PO (TO DO, IN PO)"
            totalCount={report.totalInPoCount}
            items={report.inPoEpics}
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
            title="5. DANH SÁCH CÁC EPIC CÓ SAI LỆCH DỮ LIỆU"
            totalCount={report.totalAnomalyCount}
            items={report.anomalyEpics}
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
            title="6. DANH SÁCH CÁC EPIC PENDING"
            totalCount={report.totalPendingCount || 0}
            items={report.pendingEpics || []}
            customHeader="Phân loại Trạng thái"
            renderCustomCell={(item) => (
              <td className="px-2.5 py-1.5 text-[11px] font-bold text-[#8B4513]">
                <span>{item.status}</span>
              </td>
            )}
          />

          {/* PAGE BOTTOM FOOTER */}
          <div className="border-t-2 border-black pt-4 pb-2 text-center mt-6">
            <p className="text-xs font-bold text-black uppercase tracking-wide">
              Phòng QLDA-TKTN, Trung tâm Đảm bảo chất lượng, Khối CNTT.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ReportSectionBlockSquareProps {
  customHeader: string;
  isFailTable?: boolean;
  items: ReportEpicItem[];
  jiraViewIssueBaseUrl: string;
  renderCustomCell: (item: ReportEpicItem) => React.ReactNode;
  title: string;
  totalCount: number;
}

function ReportSectionBlockSquare({
  customHeader,
  isFailTable,
  items,
  jiraViewIssueBaseUrl,
  renderCustomCell,
  title,
  totalCount,
}: ReportSectionBlockSquareProps) {
  const [collapsed, setCollapsed] = React.useState(true);

  return (
    <div className="rounded-none border border-black overflow-hidden">
      {/* Header Bar - Light Background, Clickable to Toggle Collapsed State */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        className="bg-slate-200 text-black px-3 py-2 font-bold text-xs flex items-center justify-between cursor-pointer select-none border-b border-slate-300 hover:bg-slate-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <CaretRight className="size-4 text-black shrink-0" weight="bold" /> : <CaretDown className="size-4 text-black shrink-0" weight="bold" />}
          <span>{title}</span>
        </div>
        <span className="bg-[#1463f7] text-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
          Tổng số: {totalCount} Epic
        </span>
      </div>

      {/* Table Content Container - Always printed even if collapsed on screen */}
      <div className={collapsed ? 'hidden print:block' : 'block'}>
        {items.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-gray-500 bg-gray-50">
            Không có Epic nào trong danh sách này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-gray-300 bg-gray-100 text-black font-bold select-none">
                  <th className="px-2.5 py-1.5 w-8 text-center border-r border-gray-300">STT</th>
                  <th className="px-2.5 py-1.5 w-16 border-r border-gray-300">Project</th>
                  {/* COMBINED EPIC KEY + SUMMARY COLUMN */}
                  <th className="px-2.5 py-1.5 max-w-[260px] border-r border-gray-300">Epic Key / Summary</th>
                  <th className="px-2.5 py-1.5 w-24 border-r border-gray-300">Status</th>
                  {/* RENAMED COLUMNS */}
                  <th className="px-2.5 py-1.5 w-20 border-r border-gray-300">Start E2E</th>
                  <th className="px-2.5 py-1.5 w-20 border-r border-gray-300">Start CNTT</th>
                  <th className="px-2.5 py-1.5 w-20 border-r border-gray-300">R4G Date</th>
                  <th className="px-2.5 py-1.5 w-20 border-r border-gray-300">Released Date</th>
                  <th className="px-2.5 py-1.5">{customHeader}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item, idx) => {
                  const jiraHref = jiraViewIssueBaseUrl
                    ? `${jiraViewIssueBaseUrl}${encodeURIComponent(item.epicKey)}`
                    : null;

                  return (
                    <tr key={item.epicKey} className="hover:bg-gray-50">
                      <td className="px-2.5 py-1.5 text-center font-mono text-gray-500 border-r border-gray-200">{idx + 1}</td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-black border-r border-gray-200">{item.projectKey}</td>
                      
                      {/* COMBINED EPIC KEY WITH JIRA NEW WINDOW LINK (LINE 1) & SUMMARY (LINE 2) */}
                      <td className="px-2.5 py-1.5 border-r border-gray-200">
                        {jiraHref ? (
                          <a
                            href={jiraHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-bold text-[#1463f7] hover:underline text-[11px] inline-flex items-center gap-1"
                            title="Mở Epic trên Jira (cửa sổ mới)"
                          >
                            <span>{item.epicKey}</span>
                            <ArrowSquareOut className="size-3 shrink-0" weight="bold" />
                          </a>
                        ) : (
                          <div className="font-mono font-bold text-[#1463f7] text-[11px]">{item.epicKey}</div>
                        )}
                        <div className="text-[11px] text-gray-600 truncate max-w-[260px]" title={item.summary}>
                          {item.summary}
                        </div>
                      </td>

                      {/* STATUS COLUMN WITH SPECIFIC TEXT COLOR RULES */}
                      <td className={`px-2.5 py-1.5 font-bold border-r border-gray-200 ${getStatusTextColorClass(item.status)}`}>
                        {item.status}
                      </td>

                      {/* Start E2E (formerly T0) */}
                      <td className="px-2.5 py-1.5 font-mono border-r border-gray-200">{item.ideaApprovedDate || '-'}</td>
                      {/* Start CNTT (formerly T1) */}
                      <td className="px-2.5 py-1.5 font-mono border-r border-gray-200">{item.startDate || '-'}</td>
                      {/* R4G Date */}
                      <td className="px-2.5 py-1.5 font-mono border-r border-gray-200">
                        {item.r4gDate ? item.r4gDate : isFailTable ? <span className="text-red-700 font-semibold text-[11px]">Thiếu thông tin</span> : '-'}
                      </td>
                      {/* Released Date */}
                      <td className="px-2.5 py-1.5 font-mono border-r border-gray-200">
                        {item.releasedDate ? item.releasedDate : isFailTable ? <span className="text-red-700 font-semibold text-[11px]">Thiếu thông tin</span> : '-'}
                      </td>
                      {renderCustomCell(item)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
