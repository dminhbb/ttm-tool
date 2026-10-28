'use client';

import * as React from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  Briefcase, Buildings, CalendarBlank, CalendarCheck, CalendarPlus, CalendarX, ChatCircleText, ChatsCircle, CircleHalf,
  ClockCountdown, FileText, FlagCheckered, Gauge, Info, ListNumbers, PaperPlaneRight, SealCheck, Tag, Trash, UserCircle, UsersThree,
} from '@phosphor-icons/react';
import { JiraLinkButton } from '@/components/epic-alerts/JiraLinkButton';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EpicBrowserSummary } from '@/lib/epic-browser-service';
import {
  EPIC_COMMENT_MAX_LENGTH, formatCommentStamp, normalizeCommentText, type EpicCommentEntry, type EpicTaskStatus,
} from '@/lib/epic-mark-format';
import type { ScoringNote } from '@/lib/epic-scoring-notes';
import type { FindingGroup } from '@/lib/scoring/catalog';
import { cn } from '@/lib/utils';
import { useJiraViewIssueUrl } from '@/lib/use-jira-view-issue-url';

/**
 * Popup "Review Notes" (formerly "Mark & Comment") of one Epic (owner 2026-10-27, layout "Phương án 2"): the header carries the Epic key /
 * summary and two switches — "Ẩn epic" (personal Hide) and "Giao việc" (To do / Done, shared). Below, two cards:
 * the Epic's facts grouped into "Thông tin chung" / "Thông tin dự án" on the left; on the right a frame with two tabs —
 * "Comment" (input on top, chat thread below) and "Scoring" (the Epic's active Scoring Service badges, one row each
 * with its explanation). `onChanged` is called once on close when something was saved, so the list behind can refresh.
 */

interface TaskState {
  status: EpicTaskStatus;
  updatedAt: string | null;
  updatedByName: string | null;
}

interface MarkPayload {
  /** False under "Xem dưới quyền": the previewed user's Hide is shown but not changed for them. */
  canToggleHidden: boolean;
  /** The viewer may switch "Giao việc": a PM/SM of the Epic or ADMIN and above (never under "Xem dưới quyền"). */
  canToggleTask: boolean;
  comments: EpicCommentEntry[];
  epicName: string;
  /** The viewer hid this Epic (Hide is personal). */
  isHidden: boolean;
  ownerName: string;
  /** Tab "Scoring": the Epic's active Scoring Service badges with their explanations. */
  scoring: ScoringNote[];
  summary: EpicBrowserSummary | null;
  task: TaskState;
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

/** Status of the Epic as a status Badge: finished → success, Cancelled → neutral, anything still open → warning. */
function StatusValue({ status }: { status: string | null | undefined }) {
  const text = status?.trim() ?? '';
  if (!text) return <>-</>;
  const normalized = text.toUpperCase();
  const variant = ['RELEASED', 'MVP DONE', 'MVPDONE', 'DONE', 'R4GOLIVE'].includes(normalized) ? 'success' : normalized === 'CANCELLED' ? 'neutral' : 'warning';
  return <Badge dot variant={variant}>{text}</Badge>;
}

/** A classification (Epic type, level) is a Tag, not a status. */
function TagValue({ text }: { text: string | null | undefined }) {
  return text ? <span className="ias-tag ias-tag-brand">{text}</span> : <>-</>;
}

interface InfoRow {
  icon: Icon;
  label: string;
  value: React.ReactNode;
}

function generalRows(summary: EpicBrowserSummary | null): InfoRow[] {
  return [
    { icon: CircleHalf, label: 'Trạng thái', value: <StatusValue status={summary?.status} /> },
    { icon: CalendarPlus, label: 'Ngày tạo', value: formatDate(summary?.createdDate) },
    { icon: CalendarBlank, label: 'Ngày bắt đầu (T1)', value: formatDate(summary?.startDate) },
    { icon: FlagCheckered, label: 'R4G Date', value: formatDate(summary?.r4gDate) },
    { icon: CalendarX, label: 'Due Date', value: formatDate(summary?.dueDate) },
    { icon: CalendarCheck, label: 'Ngày duyệt YT (T0)', value: formatDate(summary?.ideaApprovedDate) },
  ];
}

function projectRows(summary: EpicBrowserSummary | null, ownerName: string): InfoRow[] {
  const level = summary?.requirementLevel;
  return [
    { icon: Tag, label: 'Phân loại Epic', value: <TagValue text={summary?.epicType || summary?.epicComplexityType} /> },
    { icon: ListNumbers, label: 'Requirement Level', value: <TagValue text={level ? (level.startsWith('Mức') ? level : `Mức ${level}`) : null} /> },
    { icon: Briefcase, label: 'Tên dự án', value: summary?.projectName || '-' },
    { icon: UserCircle, label: 'PM/SM', value: ownerName || '-' },
    { icon: Buildings, label: 'Domain', value: summary?.domainName || '-' },
    { icon: UsersThree, label: 'Đơn vị yêu cầu', value: summary?.requestingUnit || '-' },
    { icon: SealCheck, label: 'TTM-applied', value: crawlText(summary?.ttmApplied) },
    { icon: ClockCountdown, label: 'Except-TTM-plan', value: crawlText(summary?.exceptTtmPlan) },
  ];
}

function InfoSection({ icon: SectionIcon, rows, title }: { icon: Icon; rows: InfoRow[]; title: string }) {
  return (
    <section className="px-4 py-3.5">
      <h3 className="m-0 mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-fb-text-primary">
        <SectionIcon className="size-4 text-[var(--color-text-brand)]" weight="fill" aria-hidden="true" />
        {title}
      </h3>
      <dl className="m-0 space-y-2.5 text-[13px]">
        {rows.map(({ icon: RowIcon, label, value }) => (
          <div className="flex items-center gap-2.5" key={label}>
            <dt className="flex w-40 shrink-0 items-center gap-2 text-fb-text-secondary">
              <RowIcon className="size-4 shrink-0 text-fb-text-placeholder" aria-hidden="true" />
              {label}
            </dt>
            <dd className="m-0 min-w-0 break-words font-semibold text-fb-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Soft avatar tones (design tokens, dark-mode aware); a user keeps the same tone everywhere. */
const AVATAR_TONES = [
  'bg-fb-blue-soft text-fb-blue',
  'bg-status-success-soft text-status-success',
  'bg-fb-accent-soft text-fb-accent',
  'bg-status-warning-soft text-status-warning',
];

function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function CommentThread({ comments, disabled, onDelete }: { comments: EpicCommentEntry[]; disabled: boolean; onDelete: (comment: EpicCommentEntry) => void }) {
  if (comments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-fb-text-secondary">
        <ChatsCircle className="size-8 text-fb-text-placeholder" aria-hidden="true" />
        <p className="m-0 text-xs">Chưa có comment nào — hãy viết comment đầu tiên ở ô phía trên.</p>
      </div>
    );
  }
  return (
    <ol className="m-0 list-none space-y-4 p-0">
      {comments.map((comment) => (
        <li className="flex gap-3" key={comment.id}>
          <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase', avatarTone(comment.userName))}>
            {comment.userName.trim().charAt(0) || '?'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-tight text-fb-text-primary">{comment.userName}</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-fb-text-secondary">{formatCommentStamp(comment.createdAt)}</div>
            <div className="mt-1.5 flex items-start gap-1.5">
              <p className={cn('ttm-chat-bubble m-0 inline-block min-w-0 max-w-full break-words whitespace-pre-wrap rounded-xl rounded-tl-sm px-3 py-2 text-[13px]', (comment.isSystem || comment.isDeleted) && 'italic opacity-80')}>
                {comment.content}
              </p>
              {comment.canDelete && (
                <Tooltip className="inline-flex w-auto shrink-0" content="Xóa comment của bạn" side="top">
                  <button
                    aria-label="Xóa comment của bạn"
                    className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-fb-text-placeholder outline-none transition-colors hover:bg-fb-control hover:text-status-danger focus-visible:ring-2 focus-visible:ring-fb-blue disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => onDelete(comment)}
                    type="button"
                  >
                    <Trash className="size-4" aria-hidden="true" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A tab of the right-hand frame ("Comment", "Scoring"). */
function FrameTab({ active, icon: TabIcon, label, onSelect }: { active: boolean; icon: Icon; label: string; onSelect: () => void }) {
  return (
    <button
      aria-selected={active}
      className={cn(
        '-mb-px inline-flex cursor-pointer items-center gap-1.5 border-0 border-b-2 bg-transparent px-1 py-2.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fb-blue',
        active ? 'border-[var(--color-bg-brand)] font-bold text-[var(--color-text-brand)]' : 'border-transparent font-semibold text-fb-text-secondary hover:text-fb-text-primary',
      )}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      <TabIcon className="size-4" weight={active ? 'fill' : 'regular'} aria-hidden="true" />
      {label}
    </button>
  );
}

/** Badge tone by finding group: failed verdict, alert, what to do, passed verdict, neutral note. */
const GROUP_BADGE_VARIANT: Record<FindingGroup, BadgeProps['variant']> = {
  ALERT: 'warning',
  FAIL: 'danger',
  NOTE: 'neutral',
  PASS: 'success',
  RECOMMENDATION: 'info',
};

/** Tab "Scoring" (owner 2026-10-28): one row per active Scoring Service badge — badge left, the Epic's own explanation right. */
function ScoringTable({ epicKey, notes }: { epicKey: string; notes: ScoringNote[] }) {
  if (notes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-fb-text-secondary">
        <Gauge className="size-8 text-fb-text-placeholder" aria-hidden="true" />
        <p className="m-0 text-xs">Epic chưa có badge nào từ Scoring Service (chưa được chấm, hoặc là Epic ngoại lệ).</p>
      </div>
    );
  }
  return (
    <>
      <p className="m-0 mb-2 text-xs text-fb-text-secondary">Đây là các đánh giá của hệ thống đối với epic {epicKey}:</p>
    <div className="overflow-hidden rounded-lg border border-fb-border bg-fb-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-fb-surface-muted text-left text-[11px] font-bold tracking-wide text-fb-text-secondary uppercase">
            <th className="w-[40%] px-3 py-2" scope="col">Badge</th>
            <th className="px-3 py-2" scope="col">Giải thích</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => (
            <tr className="border-t border-fb-border align-top" key={note.key}>
              <td className="px-3 py-2.5">
                <Badge className="whitespace-normal text-left" dot variant={GROUP_BADGE_VARIANT[note.group]}>{note.label}</Badge>
              </td>
              <td className="px-3 py-2.5 break-words text-fb-text-primary">{note.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/** The switch track itself; `onClass` is the track colour while on. */
function SwitchTrack({ checked, disabled, label, onChange, onClass = 'bg-[var(--color-bg-brand)]' }: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
  onClass?: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fb-blue disabled:cursor-not-allowed disabled:opacity-50',
        checked ? onClass : 'bg-fb-border',
      )}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={cn('inline-block size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  );
}

/** The ⓘ of a header switch — the app's shared Tooltip in `multiline` mode, so long text wraps inside its frame. */
function SwitchInfo({ info, label }: { info: string; label: string }) {
  return (
    <Tooltip className="inline-flex w-auto" content={info} multiline side="bottom">
      <span className="inline-flex text-fb-text-secondary" aria-label={`Giải thích ${label}`} role="img">
        <Info className="size-4" aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

const SWITCH_PILL_CLASS = 'flex items-center gap-2 rounded-full border border-fb-border bg-fb-surface px-2.5 py-1 text-xs font-semibold text-fb-text-primary shadow-xs';

/** "Ẩn epic": switch, label, ⓘ. */
function HiddenSwitch({ checked, disabled, info, onChange }: { checked: boolean; disabled: boolean; info: string; onChange: (next: boolean) => void }) {
  return (
    <div className={SWITCH_PILL_CLASS}>
      <SwitchTrack checked={checked} disabled={disabled} label="Ẩn epic" onChange={onChange} />
      <span className="whitespace-nowrap">Ẩn epic</span>
      <SwitchInfo info={info} label="Ẩn epic" />
    </div>
  );
}

/** "Giao việc" (owner 2026-10-27): "To do ◯ Done ⓘ" — the current side is bold navy, the other muted; Done turns the track green. */
function TaskSwitch({ disabled, done, info, onChange }: { disabled: boolean; done: boolean; info: string; onChange: (done: boolean) => void }) {
  const sideLabel = (active: boolean, text: string, value: boolean) => (
    <button
      className={cn(
        'cursor-pointer border-0 bg-transparent p-0 text-[13px] whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        active ? 'font-bold text-[var(--color-text-brand)]' : 'font-medium text-fb-text-secondary hover:text-fb-text-primary',
      )}
      disabled={disabled || active}
      onClick={() => onChange(value)}
      tabIndex={-1}
      type="button"
    >
      {text}
    </button>
  );
  return (
    <div className={cn(SWITCH_PILL_CLASS, 'gap-2.5 px-3')}>
      {sideLabel(!done, 'To do', false)}
      <SwitchTrack checked={done} disabled={disabled} label={`Giao việc: ${done ? 'Done' : 'To do'}`} onChange={onChange} onClass="bg-status-success" />
      {sideLabel(done, 'Done', true)}
      <SwitchInfo info={info} label="Giao việc" />
    </div>
  );
}

export function EpicMarkModal({ epicKey, onChanged, onClose, viewAsUserId }: { epicKey: string; onChanged?: () => void; onClose: () => void; viewAsUserId?: string }) {
  const [payload, setPayload] = React.useState<MarkPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<'COMMENT' | 'SCORING'>('COMMENT');
  const [deleting, setDeleting] = React.useState<EpicCommentEntry | null>(null);
  const changedRef = React.useRef(false);
  const viewIssueBaseUrl = useJiraViewIssueUrl();
  const url = `/api/epic-marks/${encodeURIComponent(epicKey)}`;
  // "Xem dưới quyền": read the previewed user's Hide state; writes (comments) still go to `url` as the signed-in user.
  const readUrl = viewAsUserId ? `${url}?viewAsUserId=${encodeURIComponent(viewAsUserId)}` : url;

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(readUrl, { signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) setError(data.error ?? 'Không thể tải Review Notes.');
        else setPayload(data);
      } catch {
        if (!controller.signal.aborted) setError('Không thể kết nối máy chủ.');
      }
    })();
    return () => controller.abort();
  }, [readUrl]);

  const request = async (method: 'DELETE' | 'PATCH' | 'POST', body: unknown): Promise<Record<string, unknown> | null> => {
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
    const response = await fetch(readUrl);
    if (response.ok) setPayload(await response.json());
  };

  const handleSend = async () => {
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

  const handleDeleteConfirmed = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    const data = await request('DELETE', { commentId: target.id });
    if (data) {
      setPayload((prev) => (prev ? { ...prev, comments: data.comments as EpicCommentEntry[] } : prev));
      showToast('Đã xóa comment.');
    }
  };

  const handleHiddenToggle = async (hidden: boolean) => {
    if (!payload?.canToggleHidden) return;
    const data = await request('PATCH', { hidden });
    if (data) {
      setPayload((prev) => (prev ? { ...prev, comments: data.comments as EpicCommentEntry[], isHidden: data.isHidden as boolean } : prev));
      showToast(hidden ? `Đã ẩn Epic ${epicKey} khỏi danh sách Quản trị Epic của bạn.` : `Đã bỏ ẩn Epic ${epicKey}.`);
    }
  };

  const handleTaskToggle = async (done: boolean) => {
    if (!payload?.canToggleTask) return;
    const data = await request('PATCH', { taskStatus: done ? 'DONE' : 'TODO' });
    if (data) {
      setPayload((prev) => (prev ? { ...prev, task: data.task as TaskState } : prev));
      showToast(done ? `Đã báo hoàn thành việc được giao ở Epic ${epicKey}.` : `Epic ${epicKey} chuyển lại To do.`);
    }
  };

  const handleClose = () => {
    if (changedRef.current) onChanged?.();
    onClose();
  };

  const taskDone = payload?.task.status === 'DONE';
  // Plain text with line breaks: the shared Tooltip's `multiline` mode wraps it inside its own capped width.
  const taskInfo = payload ? [
    'Giao việc: Epic có comment được coi là đã giao việc cho PM/SM. PM/SM chuyển Done để báo người giao rằng việc đã hoàn thành; mặc định To do.',
    `Chỉ PM/SM của Epic và ADMIN trở lên được đổi.${payload.canToggleTask ? '' : ' Bạn chỉ xem được trạng thái.'}`,
    payload.task.updatedByName && payload.task.updatedAt ? `Cập nhật gần nhất: ${payload.task.updatedByName} — ${formatCommentStamp(payload.task.updatedAt)}` : '',
  ].filter(Boolean).join('\n') : '';

  const title = (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">Review Notes</span>
      {payload && (
        <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-fb-text-secondary">
          <span className="truncate">{epicKey} - {payload.epicName}</span>
          <JiraLinkButton epicKey={epicKey} viewIssueBaseUrl={viewIssueBaseUrl} />
        </span>
      )}
    </span>
  );

  const switches = payload && (
    <div className="flex items-center gap-2">
      <HiddenSwitch
        checked={payload.isHidden}
        disabled={saving || !payload.canToggleHidden}
        info={payload.canToggleHidden
          ? 'Ẩn Epic khỏi danh sách Quản trị Epic của riêng bạn — người khác vẫn thấy bình thường. Tắt để hiện lại.'
          : 'Đang xem dưới quyền người khác: chỉ hiển thị trạng thái ẩn của người đó, không ẩn hộ được.'}
        onChange={(next) => void handleHiddenToggle(next)}
      />
      <TaskSwitch
        disabled={saving || !payload.canToggleTask}
        done={taskDone}
        info={taskInfo}
        onChange={(next) => void handleTaskToggle(next)}
      />
    </div>
  );

  return (
    <Modal actions={switches} icon={ChatCircleText} isOpen maxWidth="xl" maxWidthClassName="max-w-[1014px]" onClose={handleClose} title={title}>
      {error ? (
        <p className="m-0 text-sm text-status-danger">{error}</p>
      ) : !payload ? (
        <p className="m-0 text-sm text-fb-text-secondary">Đang tải…</p>
      ) : (
        // Fixed body height (owner 2026-10-28: +5% over the old natural ~538px), so switching tabs never resizes the popup.
        <div className="grid grid-cols-1 gap-4 md:h-[min(565px,65dvh)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="divide-y divide-fb-border overflow-hidden rounded-xl border border-fb-border bg-fb-surface md:overflow-y-auto">
            <InfoSection icon={FileText} rows={generalRows(payload.summary)} title="Thông tin chung" />
            <InfoSection icon={Briefcase} rows={projectRows(payload.summary, payload.ownerName)} title="Thông tin dự án" />
          </div>

          {/* Chat frame (owner 2026-10-27): light grey, the input on top, newest comment first below it. */}
          <div className="ttm-chat-frame flex min-h-[441px] flex-col overflow-hidden rounded-xl border border-fb-border md:h-full md:min-h-0">
            <div className="flex shrink-0 gap-4 border-b border-fb-border px-4" role="tablist" aria-label="Review Notes">
              <FrameTab active={tab === 'COMMENT'} icon={ChatCircleText} label={`Comment (${payload.comments.length})`} onSelect={() => setTab('COMMENT')} />
              <FrameTab active={tab === 'SCORING'} icon={Gauge} label={`Scoring (${payload.scoring.length})`} onSelect={() => setTab('SCORING')} />
            </div>
            {tab === 'SCORING' ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" role="tabpanel">
                <ScoringTable epicKey={epicKey} notes={payload.scoring} />
              </div>
            ) : (<>
            <div className="shrink-0 border-b border-fb-border px-4 py-3" role="tabpanel">
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="epic-mark-comment">Comment của {payload.viewerName}</label>
                <input
                  className="ui-input form-control-compact min-w-0 flex-1 rounded-lg placeholder:text-fb-text-placeholder"
                  id="epic-mark-comment"
                  maxLength={EPIC_COMMENT_MAX_LENGTH}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends; ignored while a Vietnamese IME is still composing the word.
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={`Nhập comment (tối đa ${EPIC_COMMENT_MAX_LENGTH} ký tự)…`}
                  readOnly={saving}
                  value={text}
                />
                <button
                  aria-label="Gửi comment"
                  className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--color-bg-brand)] text-white transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-fb-blue disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={saving || text.trim() === ''}
                  onClick={() => void handleSend()}
                  type="button"
                >
                  <PaperPlaneRight className="size-4" weight="fill" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-fb-text-placeholder">
                <span>Comment với tên <strong className="text-fb-text-secondary">{payload.viewerName}</strong> · Enter để gửi</span>
                <span className="tabular-nums">{text.length}/{EPIC_COMMENT_MAX_LENGTH}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <CommentThread comments={payload.comments} disabled={saving} onDelete={setDeleting} />
            </div>
            </>)}
          </div>
        </div>
      )}
      <ConfirmDialog
        confirmLabel="Xóa"
        description="Nội dung comment sẽ được thay bằng dòng ~~deleted~~ và không thể khôi phục hay xóa tiếp. Bạn có chắc muốn xóa?"
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDeleteConfirmed()}
        title="Xóa comment của bạn?"
      />
    </Modal>
  );
}
