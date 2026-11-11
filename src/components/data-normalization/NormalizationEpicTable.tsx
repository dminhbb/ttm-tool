'use client';

import { ArrowSquareOut, ClockCounterClockwise, Lightbulb, Warning } from '@phosphor-icons/react';
import { EpicMarkCell } from '@/components/epic-mark/EpicMarkCell';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import type { NormalizationEpicRow, NormalizationPanelTone } from '@/lib/data-normalization';

/**
 * The one Epic table of every section of "Chuẩn hoá dữ liệu" (owner 2026-11-10):
 *   Epic | PM/SM | REVIEW | Summary | Status | Created date | Ngày duyệt ý tưởng | Start date | R4G date | Due date
 * Epic: why it is listed (warning — a rule to fix; light bulb — a recommendation) with the messages as tooltip, Jira link,
 * key (opens "Duyệt Epic"). REVIEW: the same flag column as Quản trị Epic — opens the Review Notes popup.
 * "Epic thay đổi dữ liệu" (tone 'change', 2026-11-11) adds the column "Nhận xét" after Status: one bullet per change
 * ("<trường>: cũ → mới"), its data layer in the line's tooltip (the app's Tooltip).
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export interface NormalizationEpicTableProps {
  /** The section's kind: a rule to fix (warning), a recommendation (light bulb) or the changed Epics (history icon + "Nhận xét"). */
  tone?: NormalizationPanelTone;
  onBrowse: (epicKey: string) => void;
  onReview: (epicKey: string) => void;
  rows: readonly NormalizationEpicRow[];
  viewIssueBaseUrl: string;
}

export function NormalizationEpicTable({ onBrowse, onReview, rows, tone, viewIssueBaseUrl }: NormalizationEpicTableProps) {
  const showNotes = tone === 'change';
  return (
    <TableContainer>
      {/* Narrow columns (owner 2026-11-11): 8px cell padding, capped PM/SM / Status / Nhận xét, short date headers — fits a
          100% zoom window without a horizontal scrollbar. */}
      <Table className="dn-epic-table">
        <THead>
          <TR>
            <TH className="min-w-[150px]">Epic</TH>
            <TH>PM/SM</TH>
            <TH className="w-[1%] text-center" title="Review Notes — cờ cam: có comment, Giao việc To do; cờ xanh: Done; mắt gạch: bạn đã ẩn Epic. Bấm để mở Review Notes">Review</TH>
            <TH>Summary</TH>
            <TH>Status</TH>
            {showNotes && <TH>Nhận xét</TH>}
            <TH>Created date</TH>
            <TH title="Ngày duyệt ý tưởng">Ngày duyệt YT</TH>
            <TH>Start date</TH>
            <TH>R4G date</TH>
            <TH>Due date</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.epicKey}>
              <TD className="min-w-[150px] !py-1">
                <div className="flex items-center gap-1">
                  <Tooltip multiline className="inline-flex w-auto" content={row.violations.map((message) => `• ${message}`).join('\n')}>
                    {tone === 'recommendation'
                      ? <Lightbulb aria-label="Epic có khuyến nghị này" className="size-4 shrink-0 text-status-success" weight="fill" />
                      : tone === 'change'
                        ? <ClockCounterClockwise aria-label="Epic có thay đổi dữ liệu" className="size-4 shrink-0 text-fb-blue" weight="bold" />
                        : <Warning aria-label="Epic vi phạm rule này" className="size-4 shrink-0 text-status-warning" weight="fill" />}
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
              <TD className="dn-col-owner truncate !py-1" title={row.ownerName || undefined}>{row.ownerName || '—'}</TD>
              <TD className="w-[1%] !py-1 text-center">
                <EpicMarkCell onOpen={onReview} row={row} />
              </TD>
              <TD className="dn-col-summary truncate !py-1" title={row.epicName}>{row.epicName || '—'}</TD>
              <TD className="!py-1">
                {row.status
                  ? <span className="dn-status-badge rounded-full border border-fb-border bg-fb-surface-muted px-2 py-0.5 text-[11px] font-semibold text-fb-text-primary" title={row.status}>{row.status}</span>
                  : '—'}
              </TD>
              {showNotes && (
                <TD className="dn-col-notes whitespace-normal !py-1">
                  <ul className="m-0 list-disc space-y-0.5 pl-4 text-xs leading-5 text-fb-text-primary">
                    {row.violations.map((note, index) => {
                      const tooltip = row.noteTooltips?.[index];
                      return (
                        <li key={`${index}-${note}`}>
                          {tooltip ? <Tooltip className="inline-flex w-auto" content={tooltip} side="top"><span className="cursor-help">{note}</span></Tooltip> : note}
                        </li>
                      );
                    })}
                  </ul>
                </TD>
              )}
              <TD className="dn-col-date !py-1">{formatDate(row.createdDate)}</TD>
              <TD className="dn-col-date !py-1">{formatDate(row.ideaApprovedDate)}</TD>
              <TD className="dn-col-date !py-1">{formatDate(row.startDate)}</TD>
              <TD className="dn-col-date !py-1">{formatDate(row.r4gDate)}</TD>
              <TD className="dn-col-date !py-1">{formatDate(row.dueDate)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}
