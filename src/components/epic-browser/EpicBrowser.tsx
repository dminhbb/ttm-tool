'use client';

import * as React from 'react';
import { BookmarkSimple, CaretDown, CaretRight, CheckSquare, Lightning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import styles from '@/components/epic-browser/tree-table.module.css';
import { cn } from '@/lib/utils';
import { isLevel1IssueType, isLevel2IssueType } from '@/lib/issue-hierarchy';
import type { DataReviewChildrenResponse, DataReviewIssue } from '@/lib/data-review-types';

export interface EpicBrowserProps {
  /** Root-level Epic rows to render — fetched by the caller (a batch-scoped page, or a single Epic
   * looked up by key), since where the roots come from differs per use case. Everything below the
   * root (Story/Subtask drill-down) is owned entirely by this component. */
  epics: DataReviewIssue[];
  emptyDescription?: string;
  emptyTitle?: string;
}

interface ApiErrorResponse {
  error?: string;
}

const COLUMN_COUNT = 11;

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

async function getResponse<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json() as T & ApiErrorResponse;
  if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu duyệt.');
  return data;
}

// Indentation depth in the tree — NOT the same as issue kind: an Epic's own direct Subtasks (no
// parent Story) render at the same depth as Stories (level 2), since they ARE the Epic's direct
// children. The icon below is picked from the issue's real issueType, not this depth, so those
// still show as Subtasks visually.
type TreeLevel = 1 | 2 | 3;

const LEVEL_LABEL: Record<TreeLevel, string> = { 1: 'Epic', 2: 'Story', 3: 'Subtask' };

const KIND_ICON = {
  epic: { className: 'text-violet-600', icon: Lightning },
  story: { className: 'text-emerald-600', icon: BookmarkSimple },
  subtask: { className: 'text-sky-600', icon: CheckSquare },
};

function IssueTypeIcon({ issueType }: { issueType: string }) {
  const kind = isLevel1IssueType(issueType) ? 'epic' : isLevel2IssueType(issueType) ? 'story' : 'subtask';
  const { className, icon: Icon } = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center justify-center" title={issueType} role="img" aria-label={issueType}>
      <Icon className={cn('size-4', className)} weight="fill" />
    </span>
  );
}

/** Core logic: status text renders bold for Epic/Story rows (the levels that drive milestone/alert
 * evaluation), and in brown for any status other than "Done" — a lightweight, always-visible cue
 * for "this isn't finished yet" without a full badge system. */
function StatusText({ level, status }: { level: TreeLevel; status: string }) {
  const isDone = status.trim().toLocaleLowerCase('en-US') === 'done';
  return (
    <span className={cn('font-semibold', level !== 3 && 'font-bold')} style={isDone ? undefined : { color: 'brown' }}>
      {status || '-'}
    </span>
  );
}

interface IssueRowProps {
  isDimmed: boolean;
  isExpanded: boolean;
  isLastChild: boolean;
  isLoading: boolean;
  issue: DataReviewIssue;
  level: TreeLevel;
  onToggle: (issue: DataReviewIssue) => void;
}

function TreeTableRow({ isDimmed, isExpanded, isLastChild, isLoading, issue, level, onToggle }: IssueRowProps) {
  const toggleLabel = `${isExpanded ? 'Thu gọn' : 'Mở rộng'} ${LEVEL_LABEL[level]} ${issue.issueKey}`;
  const indentSlotCount = level - 1;

  return (
    <TR
      className={cn(level === 2 && styles.rowLevel2, level === 3 && styles.rowLevel3, isDimmed && styles.rowDimmed)}
      data-level={level}
    >
      <TD className="px-3 py-2">{issue.project || '-'}</TD>
      <TD className="px-3 py-2 text-center"><IssueTypeIcon issueType={issue.issueType} /></TD>
      <TD className="px-3 py-2 whitespace-nowrap">{issue.issueType || '-'}</TD>
      <TD className="px-3 py-2 whitespace-nowrap">{issue.role || '-'}</TD>
      <TD className="px-3 py-2 font-semibold text-fb-blue">
        <div className={styles.treeCell}>
          {Array.from({ length: indentSlotCount }).map((_, slotIndex) => {
            const isConnectorSlot = slotIndex === indentSlotCount - 1;
            return (
              <span
                key={slotIndex}
                className={cn(styles.indentSlot, isConnectorSlot && styles.indentConnector, isConnectorSlot && isLastChild && styles.lastChild)}
                aria-hidden="true"
              />
            );
          })}

          {issue.hasChildren ? (
            <button
              type="button"
              className={cn(styles.chevronToggle, isExpanded && styles.chevronOpen)}
              onClick={() => onToggle(issue)}
              disabled={isLoading}
              aria-expanded={isExpanded}
              aria-label={toggleLabel}
            >
              {isLoading ? (
                <span className="block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isExpanded ? (
                <CaretDown className="size-3" weight="bold" aria-hidden="true" />
              ) : (
                <CaretRight className="size-3" weight="bold" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className={styles.chevronPlaceholder} aria-hidden="true" />
          )}

          <span className={styles.name}>{issue.issueKey}</span>
        </div>
      </TD>
      <TD className="max-w-[360px] truncate px-3 py-2" title={issue.summary}>{issue.summary}</TD>
      <TD className="px-3 py-2"><StatusText level={level} status={issue.status} /></TD>
      <TD className="px-3 py-2">{formatDate(issue.startDate)}</TD>
      <TD className="px-3 py-2">{formatDate(issue.r4gDate)}</TD>
      <TD className="px-3 py-2">{formatDate(issue.dueDate)}</TD>
      <TD className="px-3 py-2 whitespace-nowrap" title={issue.dataLayerDate ?? undefined}>{formatDataLayer(issue.dataLayerDate)}</TD>
    </TR>
  );
}

interface EpicAlertHistoryEntry {
  alertDate: string;
  alertStatus: string;
  alertType: 'FAIL' | 'LATE';
}
interface EpicMilestoneHistoryEntry {
  milestone: string;
  milestoneDate: string;
}
interface EpicHistoryResponse {
  history: EpicAlertHistoryEntry[];
  milestones: EpicMilestoneHistoryEntry[];
}

const ALERT_TYPE_LABEL: Record<EpicAlertHistoryEntry['alertType'], string> = {
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
};
const MILESTONE_LABEL: Record<string, string> = {
  DESIGN_DONE: 'Design Done',
  DEV_DONE: 'Dev Done',
  TEST_DONE: 'Test Done',
};

type HistoryColumn = { date: string; label: string; status: string };

/** Epic alert/milestone history laid out horizontally (one column per event, oldest → newest) so
 * it reads as a timeline strip under the Epic's row, instead of a long vertical list. */
function EpicHistoryStrip({ epicKey }: { epicKey: string }) {
  const [data, setData] = React.useState<EpicHistoryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setData(null);
      setError(null);
      try {
        const result = await fetch(`/api/epic-alerts/${encodeURIComponent(epicKey)}/alert-history`, { signal: controller.signal });
        const body = await result.json() as EpicHistoryResponse & ApiErrorResponse;
        if (!result.ok) throw new Error(body.error ?? 'Không thể tải lịch sử cảnh báo.');
        setData(body);
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Không thể tải lịch sử cảnh báo.');
      }
    };
    void load();
    return () => controller.abort();
  }, [epicKey]);

  if (error) return <Alert variant="error" title="Không thể tải lịch sử cảnh báo">{error}</Alert>;
  if (!data) return <p className="px-1 py-2 text-fb-text-secondary">Đang tải lịch sử cảnh báo…</p>;

  const columns: HistoryColumn[] = [
    ...data.milestones.map((m) => ({ date: m.milestoneDate, label: MILESTONE_LABEL[m.milestone] ?? m.milestone, status: 'Hoàn thành' })),
    ...data.history.map((h) => ({ date: h.alertDate, label: ALERT_TYPE_LABEL[h.alertType], status: h.alertStatus })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (columns.length === 0) {
    return <p className="px-1 py-2 text-fb-text-secondary">Epic này chưa có lịch sử cảnh báo hoặc mốc hoàn thành nào.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-fb-border">
      <table className="border-collapse text-sm">
        <tbody>
          <tr>
            <th className="whitespace-nowrap border-b border-r border-fb-border bg-fb-surface-muted px-3 py-2 text-left font-bold text-fb-text-secondary">Loại</th>
            {columns.map((column, index) => (
              <td key={index} className="whitespace-nowrap border-b border-r border-fb-border px-3 py-2 font-semibold text-fb-blue last:border-r-0">{column.label}</td>
            ))}
          </tr>
          <tr>
            <th className="whitespace-nowrap border-b border-r border-fb-border bg-fb-surface-muted px-3 py-2 text-left font-bold text-fb-text-secondary">Ngày</th>
            {columns.map((column, index) => (
              <td key={index} className="whitespace-nowrap border-b border-r border-fb-border px-3 py-2 last:border-r-0">{formatDate(column.date)}</td>
            ))}
          </tr>
          <tr>
            <th className="whitespace-nowrap border-r border-fb-border bg-fb-surface-muted px-3 py-2 text-left font-bold text-fb-text-secondary">Trạng thái</th>
            {columns.map((column, index) => (
              <td key={index} className="whitespace-nowrap border-r border-fb-border px-3 py-2 last:border-r-0">{column.status}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Shared Epic > Story > Subtask browsing tree, used by every screen that needs to drill into an
 * Epic's hierarchy — "Duyệt dữ liệu lớp import" (Quản trị nguồn dữ liệu) and the Epic Browser
 * popup on "Quản lý Epic 15". Update this component (and epic-browser-service.ts on the backend)
 * to change how Epic browsing behaves everywhere at once.
 *
 * Expand/collapse state resets whenever the component remounts, not on every `epics` change — pass
 * a `key` prop that changes when the root set conceptually changes (new batch, filters, page, or
 * Epic) so React remounts a fresh tree instead of carrying over stale expand state.
 */
export function EpicBrowser({ epics, emptyDescription, emptyTitle }: EpicBrowserProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [expandedEpicId, setExpandedEpicId] = React.useState<number | null>(null);
  const [expandedStoryId, setExpandedStoryId] = React.useState<number | null>(null);
  const [loadingChildrenOf, setLoadingChildrenOf] = React.useState<number | null>(null);
  const [storiesByEpic, setStoriesByEpic] = React.useState<Record<number, DataReviewIssue[]>>({});
  const [subtasksByStory, setSubtasksByStory] = React.useState<Record<number, DataReviewIssue[]>>({});

  const loadChildren = React.useCallback(async (parentId: number, level: 'stories' | 'subtasks') => {
    setLoadingChildrenOf(parentId);
    try {
      const parameters = new URLSearchParams({ parentId: String(parentId), level });
      const result = await getResponse<DataReviewChildrenResponse>(`/api/epic-browser?${parameters.toString()}`);
      if (level === 'stories') {
        setStoriesByEpic((current) => ({ ...current, [parentId]: result.items }));
      } else {
        // Subtasks under a Story sort by Role A→Z (unmapped "-" sorts last) so subtasks from the
        // same team role cluster together.
        const sorted = [...result.items].sort((a, b) => {
          if (a.role === '-' && b.role !== '-') return 1;
          if (b.role === '-' && a.role !== '-') return -1;
          return a.role.localeCompare(b.role);
        });
        setSubtasksByStory((current) => ({ ...current, [parentId]: sorted }));
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải nhánh dữ liệu.');
    } finally {
      setLoadingChildrenOf((current) => (current === parentId ? null : current));
    }
  }, []);

  // Accordion: opening a different Epic auto-closes the previous Epic (and its Story panel).
  const toggleEpic = React.useCallback((epic: DataReviewIssue) => {
    const isOpen = expandedEpicId === epic.id;
    setExpandedEpicId(isOpen ? null : epic.id);
    setExpandedStoryId(null);
    if (!isOpen && !storiesByEpic[epic.id]) void loadChildren(epic.id, 'stories');
  }, [expandedEpicId, loadChildren, storiesByEpic]);

  // Accordion: opening a different Story (within the open Epic) auto-closes the previous Story.
  const toggleStory = React.useCallback((story: DataReviewIssue) => {
    const isOpen = expandedStoryId === story.id;
    setExpandedStoryId(isOpen ? null : story.id);
    if (!isOpen && !subtasksByStory[story.id]) void loadChildren(story.id, 'subtasks');
  }, [expandedStoryId, loadChildren, subtasksByStory]);

  if (epics.length === 0) {
    return <EmptyState title={emptyTitle ?? 'Không có Epic phù hợp'} description={emptyDescription ?? 'Thử thay đổi bộ lọc hoặc kiểm tra lại lớp dữ liệu.'} />;
  }

  const expandedEpic = expandedEpicId !== null ? epics.find((epic) => epic.id === expandedEpicId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error" title="Không thể tải dữ liệu">{error}</Alert>}
      <TableContainer>
        <Table className="w-auto">
          <THead>
            <TR>
              <TH className="px-3 py-2">Project</TH><TH className="px-3 py-2 text-center">Type</TH><TH className="px-3 py-2">Issue Type</TH><TH className="px-3 py-2">Role</TH><TH className="px-3 py-2">Key</TH><TH className="px-3 py-2">Summary</TH><TH className="px-3 py-2">Status</TH>
              <TH className="px-3 py-2">Start date</TH><TH className="px-3 py-2">R4G date</TH><TH className="px-3 py-2">Due date</TH><TH className="px-3 py-2">Lớp dữ liệu</TH>
            </TR>
          </THead>
          <TBody>
            {epics.flatMap((epic) => {
              const epicOpen = expandedEpicId === epic.id;
              const stories = epicOpen ? storiesByEpic[epic.id] ?? [] : [];
              const rows: React.ReactNode[] = [
                <TreeTableRow
                  key={`epic-${epic.id}`}
                  issue={epic}
                  level={1}
                  isDimmed={expandedEpicId !== null && !epicOpen}
                  isExpanded={epicOpen}
                  isLastChild={false}
                  isLoading={loadingChildrenOf === epic.id}
                  onToggle={toggleEpic}
                />,
              ];

              if (epicOpen) {
                if (loadingChildrenOf === epic.id && !storiesByEpic[epic.id]) {
                  // still loading — nothing to render yet, chevron shows a spinner
                } else if (stories.length === 0) {
                  rows.push(
                    <TR key={`epic-${epic.id}-empty`}>
                      <TD colSpan={COLUMN_COUNT} className="text-fb-text-secondary">Epic này chưa có Story nào.</TD>
                    </TR>,
                  );
                }

                stories.forEach((story, storyIndex) => {
                  const storyOpen = expandedStoryId === story.id;
                  const subtasks = storyOpen ? subtasksByStory[story.id] ?? [] : [];
                  const isLastStory = storyIndex === stories.length - 1;

                  rows.push(
                    <TreeTableRow
                      key={`story-${story.id}`}
                      issue={story}
                      level={2}
                      isDimmed={false}
                      isExpanded={storyOpen}
                      isLastChild={isLastStory && !storyOpen}
                      isLoading={loadingChildrenOf === story.id}
                      onToggle={toggleStory}
                    />,
                  );

                  if (storyOpen) {
                    if (loadingChildrenOf === story.id && !subtasksByStory[story.id]) {
                      // loading subtasks
                    } else if (subtasks.length === 0) {
                      rows.push(
                        <TR key={`story-${story.id}-empty`}>
                          <TD colSpan={COLUMN_COUNT} className="text-fb-text-secondary">Story này chưa có Subtask nào.</TD>
                        </TR>,
                      );
                    }
                    subtasks.forEach((subtask, subtaskIndex) => {
                      rows.push(
                        <TreeTableRow
                          key={`subtask-${subtask.id}`}
                          issue={subtask}
                          level={3}
                          isDimmed={false}
                          isExpanded={false}
                          isLastChild={subtaskIndex === subtasks.length - 1}
                          isLoading={false}
                          onToggle={() => undefined}
                        />,
                      );
                    });
                  }
                });
              }

              return rows;
            })}
          </TBody>
        </Table>
      </TableContainer>

      {expandedEpic && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-fb-text-secondary">Lịch sử cảnh báo — {expandedEpic.issueKey}</p>
          <EpicHistoryStrip key={expandedEpic.issueKey} epicKey={expandedEpic.issueKey} />
        </div>
      )}
    </div>
  );
}
