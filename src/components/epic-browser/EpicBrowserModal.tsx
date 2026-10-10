'use client';

import * as React from 'react';
import { ArrowSquareOut, CaretDown, CheckCircle, Lightning, TreeStructure, Warning, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MODAL_BACKDROP_CLASS, MODAL_FRAME_CLASS, ModalHeader, useModalBehavior } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { TtmBlackListDot } from '@/components/ui/TtmBlackListDot';
import { EpicIssuesTree } from '@/components/epic-browser/EpicIssuesTree';
import { notifyCacheRefreshTriggered } from '@/components/layout/DailyCacheWarmer';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';
import type { DataReviewIssue } from '@/lib/data-review-types';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';

export interface EpicBrowserModalProps {
  /** The Epic Key to browse, or null to keep the modal closed. */
  epicKey: string | null;
  onClose: () => void;
}

interface ApiErrorResponse {
  error?: string;
}

interface EpicBrowserApiResponse {
  canEditBlackList?: boolean;
  root: DataReviewIssue;
  summary: EpicBrowserSummary | null;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function formatDataLayer(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

/**
 * Nút toggle cho "Epic ngoại lệ" ở hàng trên cùng bên dưới tiêu đề Epic.
 * Hiển thị hover tooltip diễn giải ý nghĩa theo trạng thái True / False.
 */
function TtmBlackListTopToggle({
  canEdit,
  epicKey,
  initialValue,
  onValueChange,
}: {
  canEdit: boolean;
  epicKey: string;
  initialValue: boolean;
  onValueChange?: (nextValue: boolean) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleConfirmedToggle = async () => {
    if (!canEdit || saving) return;
    const nextValue = !value;
    const prevValue = value;
    setValue(nextValue);
    setSaving(true);
    try {
      const response = await fetch('/api/black-listed-epics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blackListed: nextValue, epicKey }),
      });
      const data = (await response.json()) as ApiErrorResponse;
      if (!response.ok) throw new Error(data.error ?? 'Không thể lưu TTM Black listed.');

      if (nextValue) {
        showToast(
          `Cảnh báo: Epic ${epicKey} đã được chuyển sang Epic ngoại lệ (TTM Black listed = true) — bị loại khỏi phạm vi tính toán Time to Market!`,
          7000
        );
      } else {
        showToast(
          `Đã bỏ ngoại lệ cho Epic ${epicKey} (TTM Black listed = false). Epic được đưa trở lại tính toán Time to Market.`,
          7000
        );
      }
      notifyCacheRefreshTriggered();
      onValueChange?.(nextValue);
    } catch (requestError: unknown) {
      setValue(prevValue);
      showToast(
        requestError instanceof Error ? requestError.message : 'Không thể kết nối API.',
        5000
      );
    } finally {
      setSaving(false);
    }
  };

  const tooltipText = value
    ? 'Epic này đang là Epic ngoại lệ — không nằm trong phạm vi tính toán Time to Market.'
    : 'Epic này đang được tính Time to Market như bình thường.';

  const confirmDescription = value
    ? 'Epic sẽ được đưa trở lại các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?'
    : 'Đánh dấu Epic này ngoại lệ sẽ loại bỏ khỏi tất cả các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?';

  const confirmTitle = value ? 'Xác nhận đưa Epic trở lại TTM' : 'Xác nhận chuyển sang Epic ngoại lệ';

  return (
    <>
      <Tooltip content={tooltipText} side="bottom" className="inline-flex w-auto">
        <button
          type="button"
          onClick={() => {
            if (!canEdit || saving) return;
            setConfirmOpen(true);
          }}
          disabled={!canEdit || saving}
          className={cn(
            'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs cursor-pointer',
            value
              ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800'
              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
            (!canEdit || saving) && 'opacity-60 cursor-not-allowed'
          )}
        >
          <TtmBlackListDot />
          <span>Epic ngoại lệ</span>
          <span
            className={cn(
              'ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              value ? 'bg-rose-600 text-white' : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            )}
          >
            {value ? 'True' : 'False'}
          </span>
        </button>
      </Tooltip>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleConfirmedToggle();
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="Đồng ý"
        cancelLabel="Hủy"
      />
    </>
  );
}

/**
 * Large popup "Duyệt Epic" thiết kế theo chuẩn giao diện Jira:
 * - Breadcrumb: ProjectKey / EpicKey
 * - Title: Summary của Epic
 * - Nút duy nhất ở hàng trên: Toggle 'Epic ngoại lệ' kèm hover tooltip
 * - Panel Details: Bố trí 2 cột (Trái/Phải)
 * - Panel "Issues in Epic": Khung border nét đứt, chứa bảng phân cấp 4 cột (Issue Type | Issue Key | Summary | Status)
 * - Panel "Giải trình Fail TTM": Thiết kế giống Details, 2 cột hiển thị các nguyên nhân khâu BA, CO, DEV, PM/SM, PO, Pentest, SA, SIT/UAT, Lý do khác.
 */
export function EpicBrowserModal({ epicKey, onClose }: EpicBrowserModalProps) {
  const [root, setRoot] = React.useState<DataReviewIssue | null>(null);
  const [summary, setSummary] = React.useState<EpicBrowserSummary | null>(null);
  const [canEditBlackList, setCanEditBlackList] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const [issuesOpen, setIssuesOpen] = React.useState(true);
  const [failExplainOpen, setFailExplainOpen] = React.useState(true);

  const viewIssueBaseUrl = useJiraViewIssueUrl();
  const jiraUrl = viewIssueBaseUrl && epicKey ? `${viewIssueBaseUrl}${epicKey}` : null;

  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  const isOpen = !!epicKey;

  React.useEffect(() => {
    if (!epicKey) return undefined;
    const controller = new AbortController();

    const fetchRoot = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setRoot(null);
      setSummary(null);
      setError(null);
      setIsLoading(true);
      try {
        const response = await fetch(`/api/epic-browser?epicKey=${encodeURIComponent(epicKey)}`, { signal: controller.signal });
        const data = (await response.json()) as EpicBrowserApiResponse & ApiErrorResponse;
        if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu Epic.');
        setRoot(data.root);
        setSummary(data.summary);
        setCanEditBlackList(Boolean(data.canEditBlackList));
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Không thể kết nối API.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void fetchRoot();
    return () => controller.abort();
  }, [epicKey]);

  useModalBehavior(isOpen, onClose, closeButtonRef);

  if (!isOpen) return null;

  const projectKey = summary?.projectKey || (epicKey.includes('-') ? epicKey.split('-')[0] : 'PROJECT');
  const epicSummaryText = summary?.epicName || root?.summary || epicKey;
  const currentStatusText = summary?.status || root?.status || 'IN PROGRESS';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className={MODAL_BACKDROP_CLASS} onClick={onClose} aria-hidden="true" />

      <div
        className={cn(MODAL_FRAME_CLASS, 'h-[88vh] w-[95vw] max-w-6xl overflow-hidden flex flex-col')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <ModalHeader
          closeButtonRef={closeButtonRef}
          icon={TreeStructure}
          onClose={onClose}
          title={
            <span className="flex items-center gap-2">
              Duyệt Epic —{' '}
              {jiraUrl ? (
                <a
                  href={jiraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-blue-600 dark:text-blue-400 inline-flex items-center gap-1"
                  title="Mở Epic trên Jira (tab mới)"
                >
                  {epicKey}
                  <ArrowSquareOut size={16} weight="bold" />
                </a>
              ) : (
                epicKey
              )}
              {summary?.ttmBlackListed && <TtmBlackListDot />}
            </span>
          }
          titleId={titleId}
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && <Alert variant="error" title="Không thể tải dữ liệu">{error}</Alert>}
          {!error && isLoading && <TableSkeleton rows={8} />}

          {!error && !isLoading && root && (
            <>
              {/* Header section theo Jira */}
              <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                {/* Breadcrumb line */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <Lightning className="size-4 text-violet-600 fill-violet-600 shrink-0" weight="fill" />
                  <span className="hover:underline cursor-pointer">{projectKey}</span>
                  <span>/</span>
                  {jiraUrl ? (
                    <a
                      href={jiraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                      title="Mở Epic trên Jira (tab mới)"
                    >
                      {epicKey}
                      <ArrowSquareOut size={13} weight="bold" />
                    </a>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer">{epicKey}</span>
                  )}
                  {summary?.ttmBlackListed && <TtmBlackListDot />}
                </div>

                {/* Epic Summary Title */}
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {epicSummaryText}
                </h2>

                {/* Nút duy nhất ở hàng trên: Toggle 'Epic ngoại lệ' */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {summary && (
                    <TtmBlackListTopToggle
                      canEdit={canEditBlackList}
                      epicKey={summary.epicKey}
                      initialValue={summary.ttmBlackListed}
                      onValueChange={(nextVal) => {
                        setSummary((prev) => (prev ? { ...prev, ttmBlackListed: nextVal } : prev));
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Tab Details Section (2 cụm cột Trái / Phải) */}
              <div>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <CaretDown className={cn('size-3.5 transition-transform', !detailsOpen && '-rotate-90')} weight="bold" />
                  <span>Details</span>
                </button>

                {detailsOpen && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-xs bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-lg border border-slate-200/80 dark:border-slate-800">
                    {/* Cụm Cột Trái */}
                    <div className="space-y-2.5">
                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Type:</span>
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                          <Lightning className="size-4 text-violet-600 fill-violet-600" weight="fill" />
                          Epic
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Phân loại Epic:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.epicType || summary?.epicComplexityType || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Requirement Level:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.requirementLevel ? (summary.requirementLevel.startsWith('Mức') ? summary.requirementLevel : `Mức ${summary.requirementLevel}`) : '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Tên dự án:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.projectName || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">PM / SM:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.ownerName || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Domain:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.domainName || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Đơn vị yêu cầu:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.requestingUnit || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Epic Name:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.epicName || '-'}
                        </span>
                      </div>
                    </div>

                    {/* Cụm Cột Phải */}
                    <div className="space-y-2.5">
                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Status:</span>
                        <span className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white uppercase tracking-wider">
                          {currentStatusText}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Created Date:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(summary?.createdDate ?? null)}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Start Date (T1):</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(summary?.startDate ?? null)}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">R4G Date:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(summary?.r4gDate ?? null)}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Due Date:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(summary?.dueDate ?? null)}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Ngày duyệt YT (T0):</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDate(summary?.ideaApprovedDate ?? null)}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Lớp dữ liệu:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {formatDataLayer(summary?.dataLayerDate ?? null)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Tab "Issues in Epic" Section (Khung nét đứt, bảng phân cấp 4 cột) */}
              <div>
                <button
                  type="button"
                  onClick={() => setIssuesOpen(!issuesOpen)}
                  className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <CaretDown className={cn('size-3.5 transition-transform', !issuesOpen && '-rotate-90')} weight="bold" />
                  <span>Issues in Epic</span>
                </button>

                {issuesOpen && (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                    <EpicIssuesTree root={root} />
                  </div>
                )}
              </div>

              {/* Panel "Giải trình Fail TTM" (2 cụm cột Trái / Phải) */}
              <div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setFailExplainOpen(!failExplainOpen)}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    <CaretDown className={cn('size-3.5 transition-transform', !failExplainOpen && '-rotate-90')} weight="bold" />
                    <span>Giải trình Fail TTM</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {summary?.ttmCnttVerdictLabel && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs',
                          summary.ttmCnttVerdict === 'PASS' && 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800',
                          summary.ttmCnttVerdict === 'FAIL' && 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800',
                          summary.ttmCnttVerdict === 'DATA_ANOMALY' && 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800',
                          summary.ttmCnttVerdict === 'EXCLUDED' && 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800',
                          (summary.ttmCnttVerdict === 'PENDING' || summary.ttmCnttVerdict === 'N_A' || !summary.ttmCnttVerdict) &&
                            'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        )}
                      >
                        {summary.ttmCnttVerdict === 'PASS' && <CheckCircle className="size-3.5 text-emerald-600 dark:text-emerald-400" weight="bold" />}
                        {summary.ttmCnttVerdict === 'FAIL' && <WarningCircle className="size-3.5 text-rose-600 dark:text-rose-400" weight="bold" />}
                        {summary.ttmCnttVerdict === 'DATA_ANOMALY' && <Warning className="size-3.5 text-amber-600 dark:text-amber-400" weight="bold" />}
                        <span>{summary.ttmCnttVerdictLabel}</span>
                      </span>
                    )}

                    {summary?.hasMissingFailReason && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-xs bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800"
                        title="Epic bị Scoring Service đánh giá Fail TTM-CNTT nhưng chưa có lý do/giải trình tại các khâu"
                      >
                        <Warning className="size-3.5 text-rose-600 dark:text-rose-400" weight="bold" />
                        <span>Thiếu lý do Fail TTM</span>
                      </span>
                    )}
                  </div>
                </div>

                {failExplainOpen && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-xs bg-slate-50/50 dark:bg-slate-900/30 p-4 rounded-lg border border-slate-200/80 dark:border-slate-800">
                    {/* Cụm Cột Trái */}
                    <div className="space-y-2.5">
                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu BA:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauBa || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu CO:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauCo || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu DEV:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauDev || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu PM/SM:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauPmSm || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu PO:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauPo || '-'}
                        </span>
                      </div>
                    </div>

                    {/* Cụm Cột Phải */}
                    <div className="space-y-2.5">
                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu Pentest:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauPentest || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu SA:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauSa || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Khâu SIT/UAT:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.khauSitUat || '-'}
                        </span>
                      </div>

                      <div className="flex items-center">
                        <span className="w-36 font-semibold text-slate-500 dark:text-slate-400">Lý do khác:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {summary?.noteLyDoKhac || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
