'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkSimple, CaretDown, CaretRight, CheckSquare, Lightning, ArrowLeft } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import styles from '@/components/data-review/tree-table.module.css';
import { cn } from '@/lib/utils';
import type {
  DataReviewChildrenResponse,
  DataReviewEpicsResponse,
  DataReviewFilterOptions,
  DataReviewIssue,
} from '@/lib/data-review-types';

interface DataReviewTableProps {
  batchId: number;
}

interface ApiErrorResponse {
  error?: string;
}

const EMPTY_FILTER_OPTIONS: DataReviewFilterOptions = {
  componentsByProject: {},
  issueTypes: [],
  projects: [],
  statuses: [],
};

const COLUMN_COUNT = 10;

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

async function getResponse<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json() as T & ApiErrorResponse;
  if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu duyệt.');
  return data;
}

type TreeLevel = 1 | 2 | 3;

const LEVEL_LABEL: Record<TreeLevel, string> = { 1: 'Epic', 2: 'Story', 3: 'Subtask' };

const LEVEL_ICON: Record<TreeLevel, { className: string; icon: React.ComponentType<{ className?: string; weight?: 'fill' | 'bold' }> }> = {
  1: { className: 'text-violet-600', icon: Lightning },
  2: { className: 'text-emerald-600', icon: BookmarkSimple },
  3: { className: 'text-sky-600', icon: CheckSquare },
};

function IssueTypeIcon({ issueType, level }: { issueType: string; level: TreeLevel }) {
  const { className, icon: Icon } = LEVEL_ICON[level];
  return (
    <span className="inline-flex items-center justify-center" title={issueType} role="img" aria-label={issueType}>
      <Icon className={cn('size-4', className)} weight="fill" />
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
      <TD className="px-3 py-2 text-center"><IssueTypeIcon issueType={issue.issueType} level={level} /></TD>
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
      <TD className="px-3 py-2">{issue.status}</TD>
      <TD className="px-3 py-2">{formatDate(issue.startDate)}</TD>
      <TD className="px-3 py-2">{formatDate(issue.r4gDate)}</TD>
      <TD className="px-3 py-2">{formatDate(issue.dueDate)}</TD>
      <TD className="px-3 py-2">{issue.assignee || '-'}</TD>
      <TD className="px-3 py-2">{issue.jiraId || '-'}</TD>
    </TR>
  );
}

export function DataReviewTable({ batchId }: DataReviewTableProps) {
  const router = useRouter();
  const [component, setComponent] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [expandedEpicId, setExpandedEpicId] = React.useState<number | null>(null);
  const [expandedStoryId, setExpandedStoryId] = React.useState<number | null>(null);
  const [filterOptions, setFilterOptions] = React.useState<DataReviewFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [issueType, setIssueType] = React.useState('');
  const [loadingChildrenOf, setLoadingChildrenOf] = React.useState<number | null>(null);
  const [page, setPage] = React.useState(1);
  const [project, setProject] = React.useState('');
  const [response, setResponse] = React.useState<DataReviewEpicsResponse | null>(null);
  const [status, setStatus] = React.useState('');
  const [storiesByEpic, setStoriesByEpic] = React.useState<Record<number, DataReviewIssue[]>>({});
  const [subtasksByStory, setSubtasksByStory] = React.useState<Record<number, DataReviewIssue[]>>({});

  React.useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ batchId: String(batchId), page: String(page) });
    if (project) parameters.set('project', project);
    if (status) parameters.set('status', status);
    if (component) parameters.set('component', component);
    if (issueType) parameters.set('issueType', issueType);

    const fetchEpics = async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await getResponse<DataReviewEpicsResponse>(`/api/data-review?${parameters.toString()}`, controller.signal);
        setResponse(data);
        setFilterOptions(data.filterOptions);
        setExpandedEpicId(null);
        setExpandedStoryId(null);
        setStoriesByEpic({});
        setSubtasksByStory({});
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Không thể tải dữ liệu duyệt.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void fetchEpics();

    return () => controller.abort();
  }, [batchId, component, issueType, page, project, status]);

  const loadChildren = React.useCallback(async (parentId: number, level: 'stories' | 'subtasks') => {
    setLoadingChildrenOf(parentId);
    try {
      const parameters = new URLSearchParams({ batchId: String(batchId), parentId: String(parentId), level });
      const result = await getResponse<DataReviewChildrenResponse>(`/api/data-review?${parameters.toString()}`);
      if (level === 'stories') {
        setStoriesByEpic((current) => ({ ...current, [parentId]: result.items }));
      } else {
        setSubtasksByStory((current) => ({ ...current, [parentId]: result.items }));
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể tải nhánh dữ liệu.');
    } finally {
      setLoadingChildrenOf((current) => (current === parentId ? null : current));
    }
  }, [batchId]);

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

  const components = project ? filterOptions.componentsByProject[project] ?? [] : [];
  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-bold text-fb-text-primary">Duyệt dữ liệu lớp import #{batchId}</h2>
          <p className="mt-1 text-fb-text-secondary">Mở Epic để xem Story và mở Story để xem Subtask.</p>
        </div>
        <Button variant="outline" icon={<ArrowLeft className="size-4" weight="bold" />} onClick={() => router.push('/')}>
          Quay lại import
        </Button>
      </div>

      <div className="grid gap-4 rounded-lg border border-fb-border bg-fb-surface-muted p-4 md:grid-cols-2 xl:grid-cols-4">
        <Select
          label="Project"
          value={project}
          onChange={(event) => { setProject(event.target.value); setComponent(''); setPage(1); }}
          options={[{ value: '', label: 'Tất cả project' }, ...filterOptions.projects.map((value) => ({ value, label: value }))]}
        />
        <Select
          label="Status"
          value={status}
          onChange={(event) => { setStatus(event.target.value); setPage(1); }}
          options={[{ value: '', label: 'Tất cả status' }, ...filterOptions.statuses.map((value) => ({ value, label: value }))]}
        />
        <Select
          label="Issue type"
          value={issueType}
          onChange={(event) => { setIssueType(event.target.value); setPage(1); }}
          helperText="Giữ lại Epic có issue type này trong cây dữ liệu."
          options={[{ value: '', label: 'Tất cả issue type' }, ...filterOptions.issueTypes.map((value) => ({ value, label: value }))]}
        />
        <Select
          label="Component/s"
          value={component}
          disabled={!project}
          onChange={(event) => { setComponent(event.target.value); setPage(1); }}
          helperText={project ? 'Danh sách theo project đã chọn.' : 'Chọn project để lọc Component/s.'}
          options={[{ value: '', label: 'Tất cả component' }, ...components.map((value) => ({ value, label: value }))]}
        />
      </div>

      {error && <Alert variant="error" title="Không thể tải dữ liệu">{error}</Alert>}

      {isLoading ? <TableSkeleton rows={10} /> : response && response.items.length === 0 ? (
        <EmptyState title="Không có Epic phù hợp" description="Thử thay đổi bộ lọc hoặc kiểm tra lại lớp dữ liệu import." />
      ) : response ? (
        <>
          <TableContainer>
            <Table className="w-auto">
              <THead>
                <TR>
                  <TH className="px-3 py-2">Project</TH><TH className="px-3 py-2 text-center">Type</TH><TH className="px-3 py-2">Key</TH><TH className="px-3 py-2">Summary</TH><TH className="px-3 py-2">Status</TH>
                  <TH className="px-3 py-2">Start date</TH><TH className="px-3 py-2">R4G date</TH><TH className="px-3 py-2">Due date</TH><TH className="px-3 py-2">Assignee</TH><TH className="px-3 py-2">ID</TH>
                </TR>
              </THead>
              <TBody>
                {response.items.flatMap((epic) => {
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

          <div className="flex items-center justify-between gap-3">
            <p className="text-fb-text-secondary">Hiển thị {response.items.length} / {response.total} Epic</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Trang trước</Button>
              <span className="text-fb-text-secondary">Trang {page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Trang sau</Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
