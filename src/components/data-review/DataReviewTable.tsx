'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CaretDown, CaretRight } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { TableAction } from '@/components/ui/TableAction';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
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

interface IssueRowProps {
  childrenLoaded: boolean;
  expanded: boolean;
  hasChildren: boolean;
  issue: DataReviewIssue;
  level: 0 | 1 | 2;
  loadingChildren: boolean;
  onToggle: (issue: DataReviewIssue) => void;
}

function IssueRow({ childrenLoaded, expanded, hasChildren, issue, level, loadingChildren, onToggle }: IssueRowProps) {
  const prefixClass = level === 0 ? 'pl-0' : level === 1 ? 'pl-5' : 'pl-10';

  return (
    <TR className={level === 1 ? 'bg-fb-blue-soft/20' : level === 2 ? 'bg-fb-surface-muted/45' : undefined}>
      <TD>{issue.project || '-'}</TD>
      <TD>{issue.jiraId || '-'}</TD>
      <TD>{issue.issueType}</TD>
      <TD className="font-semibold text-fb-blue">{issue.issueKey}</TD>
      <TD>{issue.status}</TD>
      <TD>{formatDate(issue.startDate)}</TD>
      <TD>{formatDate(issue.r4gDate)}</TD>
      <TD>{formatDate(issue.dueDate)}</TD>
      <TD className="max-w-[360px] truncate" title={issue.summary}>
        <div className={`flex min-w-0 items-center gap-2 ${prefixClass}`}>
          {hasChildren ? (
            <TableAction
              variant="neutral"
              icon={expanded ? <CaretDown className="size-4" weight="bold" /> : <CaretRight className="size-4" weight="bold" />}
              onClick={() => onToggle(issue)}
              disabled={loadingChildren}
            >
              {loadingChildren ? 'Đang tải' : expanded ? 'Thu gọn' : childrenLoaded ? 'Mở lại' : 'Mở'}
            </TableAction>
          ) : (
            <span className="inline-block w-8" aria-hidden="true" />
          )}
          <span className="truncate">{issue.summary}</span>
        </div>
      </TD>
      <TD>{issue.assignee || '-'}</TD>
    </TR>
  );
}

export function DataReviewTable({ batchId }: DataReviewTableProps) {
  const router = useRouter();
  const [component, setComponent] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [expandedEpics, setExpandedEpics] = React.useState<Set<number>>(new Set());
  const [expandedStories, setExpandedStories] = React.useState<Set<number>>(new Set());
  const [filterOptions, setFilterOptions] = React.useState<DataReviewFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [issueType, setIssueType] = React.useState('');
  const [loadingChildren, setLoadingChildren] = React.useState<Set<number>>(new Set());
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
        setExpandedEpics(new Set());
        setExpandedStories(new Set());
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
    setLoadingChildren((current) => new Set(current).add(parentId));
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
      setLoadingChildren((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
  }, [batchId]);

  const toggleEpic = React.useCallback((epic: DataReviewIssue) => {
    const isOpen = expandedEpics.has(epic.id);
    setExpandedEpics((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(epic.id);
      else next.add(epic.id);
      return next;
    });
    if (!isOpen && !storiesByEpic[epic.id]) void loadChildren(epic.id, 'stories');
  }, [expandedEpics, loadChildren, storiesByEpic]);

  const toggleStory = React.useCallback((story: DataReviewIssue) => {
    const isOpen = expandedStories.has(story.id);
    setExpandedStories((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(story.id);
      else next.add(story.id);
      return next;
    });
    if (!isOpen && !subtasksByStory[story.id]) void loadChildren(story.id, 'subtasks');
  }, [expandedStories, loadChildren, subtasksByStory]);

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
            <Table className="min-w-[1580px]">
              <THead>
                <TR>
                  <TH>Project</TH><TH>ID</TH><TH>Issue type</TH><TH>Key</TH><TH>Status</TH>
                  <TH>Start date</TH><TH>R4G date</TH><TH>Due date</TH><TH>Summary</TH><TH>Assignee</TH>
                </TR>
              </THead>
              <TBody>
                {response.items.flatMap((epic) => {
                  const stories = storiesByEpic[epic.id] ?? [];
                  const epicOpen = expandedEpics.has(epic.id);
                  const rows: React.ReactNode[] = [
                    <IssueRow key={`epic-${epic.id}`} issue={epic} level={0} hasChildren expanded={epicOpen} childrenLoaded={Boolean(storiesByEpic[epic.id])} loadingChildren={loadingChildren.has(epic.id)} onToggle={toggleEpic} />,
                  ];
                  if (epicOpen) {
                    for (const story of stories) {
                      const subtasks = subtasksByStory[story.id] ?? [];
                      const storyOpen = expandedStories.has(story.id);
                      rows.push(<IssueRow key={`story-${story.id}`} issue={story} level={1} hasChildren expanded={storyOpen} childrenLoaded={Boolean(subtasksByStory[story.id])} loadingChildren={loadingChildren.has(story.id)} onToggle={toggleStory} />);
                      if (storyOpen) {
                        rows.push(...subtasks.map((subtask) => <IssueRow key={`subtask-${subtask.id}`} issue={subtask} level={2} hasChildren={false} expanded={false} childrenLoaded loadingChildren={false} onToggle={() => undefined} />));
                      }
                    }
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
