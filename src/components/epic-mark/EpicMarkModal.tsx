'use client';

import * as React from 'react';
import { FlagBanner } from '@phosphor-icons/react';
import { JiraLinkButton } from '@/components/epic-alerts/JiraLinkButton';
import { Modal } from '@/components/ui/Modal';
import { PillToggle } from '@/components/ui/PillToggle';
import { showToast } from '@/components/ui/Toast';
import { EpicCommentList } from '@/components/epic-mark/EpicCommentList';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';
import { EPIC_COMMENT_MAX_LENGTH, normalizeCommentText, type EpicCommentEntry } from '@/lib/epic-mark-format';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';

/**
 * Popup "Mark & Comment" of one Epic (owner 2026-10-27): header with key / summary / PM-SM, a comment box with
 * Save and the Hide/Unhide toggle, then a 50:50 panel — the Epic's facts on the left, its comments on the right.
 * `onChanged` is called once on close when something was saved, so the list behind can refresh.
 */

interface MarkPayload {
  comments: EpicCommentEntry[];
  epicName: string;
  isHidden: boolean;
  ownerName: string;
  summary: EpicBrowserSummary | null;
  /** Username of the viewer — the name their comments are saved under. */
  viewerName: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN').format(date);
}

/** Jira sends "None" for an empty crawl field. */
function crawlText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text && text.toLowerCase() !== 'none' ? text : '-';
}

function infoFields(summary: EpicBrowserSummary | null): [string, string][] {
  const level = summary?.requirementLevel;
  return [
    ['Status', summary?.status || '-'],
    ['Created Date', formatDate(summary?.createdDate)],
    ['Start Date (T1)', formatDate(summary?.startDate)],
    ['R4G Date', formatDate(summary?.r4gDate)],
    ['Due Date', formatDate(summary?.dueDate)],
    ['Ngày duyệt YT (T0)', formatDate(summary?.ideaApprovedDate)],
    ['Phân loại Epic', summary?.epicType || summary?.epicComplexityType || '-'],
    ['Requirement Level', level ? (level.startsWith('Mức') ? level : `Mức ${level}`) : '-'],
    ['Tên dự án', summary?.projectName || '-'],
    ['Domain', summary?.domainName || '-'],
    ['Đơn vị yêu cầu', summary?.requestingUnit || '-'],
    ['TTM-applied', crawlText(summary?.ttmApplied)],
    ['Except-TTM-plan', crawlText(summary?.exceptTtmPlan)],
  ];
}

export function EpicMarkModal({ epicKey, onChanged, onClose }: { epicKey: string; onChanged?: () => void; onClose: () => void }) {
  const [payload, setPayload] = React.useState<MarkPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const changedRef = React.useRef(false);
  const viewIssueBaseUrl = useJiraViewIssueUrl();
  const url = `/api/epic-marks/${encodeURIComponent(epicKey)}`;

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) setError(data.error ?? 'Không thể tải Mark & Comment.');
        else setPayload(data);
      } catch {
        if (!controller.signal.aborted) setError('Không thể kết nối máy chủ.');
      }
    })();
    return () => controller.abort();
  }, [url]);

  const request = async (method: 'PATCH' | 'POST', body: unknown): Promise<Record<string, unknown> | null> => {
    setSaving(true);
    try {
      const response = await fetch(url, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, method });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error ?? 'Không thể lưu.');
        return null;
      }
      changedRef.current = true;
      return data;
    } catch {
      showToast('Không thể kết nối máy chủ.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const reloadComments = async () => {
    const response = await fetch(url);
    if (response.ok) setPayload(await response.json());
  };

  const handleSave = async () => {
    // Same filter the server applies (epic-mark-format.ts): what is sent is already clean.
    if (text.trim() === '' || saving) return;
    const comment = normalizeCommentText(text);
    if (!comment) {
      showToast('Comment không hợp lệ sau khi lọc ký tự không an toàn — vui lòng nhập lại.');
      return;
    }
    if (await request('POST', { comment })) {
      setText('');
      await reloadComments();
    }
  };

  const handleToggle = async (hidden: boolean) => {
    const data = await request('PATCH', { hidden });
    if (data) {
      setPayload((prev) => (prev ? { ...prev, comments: data.comments as EpicCommentEntry[], isHidden: data.isHidden as boolean } : prev));
      showToast(hidden ? `Đã ẩn Epic ${epicKey} khỏi danh sách Quản trị Epic.` : `Đã bỏ ẩn Epic ${epicKey}.`);
    }
  };

  const handleClose = () => {
    if (changedRef.current) onChanged?.();
    onClose();
  };

  return (
    <Modal icon={FlagBanner} isOpen maxWidth="xl" onClose={handleClose} title="Mark & Comment">
      {error ? (
        <p className="m-0 text-sm text-status-danger">{error}</p>
      ) : !payload ? (
        <p className="m-0 text-sm text-fb-text-secondary">Đang tải…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-x-6">
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-fb-text-primary">
              <JiraLinkButton epicKey={epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
              <span className="min-w-0">{epicKey} - {payload.epicName}</span>
            </div>
            <PillToggle
              className="shrink-0"
              disabled={saving}
              onChange={(value) => void handleToggle(value)}
              options={[
                { activeColor: 'bg-[var(--color-bg-brand)]', label: 'Unhide', value: false },
                { activeColor: 'bg-[var(--color-bg-brand)]', label: 'Hide', value: true },
              ]}
              size="sm"
              value={payload.isHidden}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="shrink-0 text-xs font-bold text-fb-text-primary" htmlFor="epic-mark-comment">{payload.viewerName} comment:</label>
            <input
              className="ui-input form-control-compact min-w-0 flex-1 placeholder:text-fb-text-placeholder"
              id="epic-mark-comment"
              maxLength={EPIC_COMMENT_MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                // Enter saves; ignored while a Vietnamese IME is still composing the word.
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              placeholder={`Nhập comment (tối đa ${EPIC_COMMENT_MAX_LENGTH} ký tự) rồi nhấn Enter để lưu`}
              readOnly={saving}
              value={text}
            />
            <span className="shrink-0 text-[11px] tabular-nums text-fb-text-placeholder">{text.length}/{EPIC_COMMENT_MAX_LENGTH}</span>
            <div className="ml-auto shrink-0 text-xs text-fb-text-secondary">Assignee: <span className="font-semibold text-fb-text-primary">{payload.ownerName || '-'}</span></div>
          </div>

          <div className="grid min-h-[260px] grid-cols-1 gap-4 md:grid-cols-2">
            <div className="p-4">
              <dl className="m-0 space-y-2 text-xs">
                {infoFields(payload.summary).map(([label, value]) => (
                  <div className="flex gap-2" key={label}>
                    <dt className="w-36 shrink-0 font-semibold text-fb-text-placeholder">{label}:</dt>
                    <dd className="m-0 min-w-0 break-words font-medium text-fb-text-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-fb-border/80 p-4">
              <EpicCommentList comments={payload.comments} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
