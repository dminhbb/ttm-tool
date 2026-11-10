'use client';

import { ArrowSquareOut, Lightbulb, Warning } from '@phosphor-icons/react';
import { EpicMarkCell } from '@/components/epic-mark/EpicMarkCell';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Tooltip } from '@/components/ui/Tooltip';
import type { NormalizationEpicRow } from '@/lib/data-normalization';

/**
 * The one Epic table of every section of "Chuẩn hoá dữ liệu" (owner 2026-11-10):
 *   Epic | PM/SM | REVIEW | Summary | Status | Created date | Ngày duyệt ý tưởng | Start date | R4G date | Due date
 * Epic: why it is listed (warning — a rule to fix; light bulb — a recommendation) with the messages as tooltip, Jira link,
 * key (opens "Duyệt Epic"). REVIEW: the same flag column as Quản trị Epic — opens the Review Notes popup.
 */

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export interface NormalizationEpicTableProps {
  /** The section is a recommendation (light bulb) rather than a rule to fix (warning). */
  isRecommendation: boolean;
  onBrowse: (epicKey: string) => void;
  onReview: (epicKey: string) => void;
  rows: readonly NormalizationEpicRow[];
  viewIssueBaseUrl: string;
}

export function NormalizationEpicTable({ isRecommendation, onBrowse, onReview, rows, viewIssueBaseUrl }: NormalizationEpicTableProps) {
  return (
    <TableContainer>
      <Table className="min-w-[1100px]">
        <THead>
          <TR>
            <TH className="min-w-[170px]">Epic</TH>
            <TH className="min-w-[110px]">PM/SM</TH>
            <TH className="w-[1%] text-center" title="Review Notes — cờ cam: có comment, Giao việc To do; cờ xanh: Done; mắt gạch: bạn đã ẩn Epic. Bấm để mở Review Notes">Review</TH>
            <TH className="min-w-[280px]">Summary</TH>
            <TH>Status</TH>
            <TH>Created date</TH>
            <TH>Ngày duyệt ý tưởng</TH>
            <TH>Start date</TH>
            <TH>R4G date</TH>
            <TH>Due date</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.epicKey}>
              <TD className="min-w-[170px] !py-1">
                <div className="flex items-center gap-1">
                  <Tooltip multiline className="inline-flex w-auto" content={row.violations.map((message) => `• ${message}`).join('\n')}>
                    {isRecommendation
                      ? <Lightbulb aria-label="Epic có khuyến nghị này" className="size-4 shrink-0 text-status-success" weight="fill" />
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
              <TD className="max-w-[200px] truncate !py-1" title={row.ownerName || undefined}>{row.ownerName || '—'}</TD>
              <TD className="w-[1%] !py-1 text-center">
                <EpicMarkCell onOpen={onReview} row={row} />
              </TD>
              <TD className="max-w-[420px] truncate !py-1" title={row.epicName}>{row.epicName || '—'}</TD>
              <TD className="!py-1">
                {row.status
                  ? <span className="rounded-full border border-fb-border bg-fb-surface-muted px-2 py-0.5 text-[11px] font-semibold text-fb-text-primary">{row.status}</span>
                  : '—'}
              </TD>
              <TD className="!py-1">{formatDate(row.createdDate)}</TD>
              <TD className="!py-1">{formatDate(row.ideaApprovedDate)}</TD>
              <TD className="!py-1">{formatDate(row.startDate)}</TD>
              <TD className="!py-1">{formatDate(row.r4gDate)}</TD>
              <TD className="!py-1">{formatDate(row.dueDate)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}
