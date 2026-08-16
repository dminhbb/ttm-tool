'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EpicBrowser } from '@/components/epic-browser/EpicBrowser';
import type { DataReviewEpicsResponse, DataReviewFilterOptions } from '@/lib/data-review-types';

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

async function getResponse<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const data = await response.json() as T & ApiErrorResponse;
  if (!response.ok) throw new Error(data.error ?? 'Không thể tải dữ liệu duyệt.');
  return data;
}

/**
 * "Duyệt dữ liệu lớp import": batch-scoped chrome (filters, pagination, "which Epics did this
 * import bring in") around the shared EpicBrowser tree. Epic browsing behavior itself (expand/
 * collapse, Story/Subtask drill-down) lives entirely in EpicBrowser — this component only fetches
 * the root-level Epic page and hands it over.
 */
export function DataReviewTable({ batchId }: DataReviewTableProps) {
  const router = useRouter();
  const [component, setComponent] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [filterOptions, setFilterOptions] = React.useState<DataReviewFilterOptions>(EMPTY_FILTER_OPTIONS);
  const [isLoading, setIsLoading] = React.useState(true);
  const [issueType, setIssueType] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [project, setProject] = React.useState('');
  const [response, setResponse] = React.useState<DataReviewEpicsResponse | null>(null);
  const [status, setStatus] = React.useState('');

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

      {isLoading ? <TableSkeleton rows={10} /> : response ? (
        <>
          <EpicBrowser key={`${batchId}-${page}-${project}-${status}-${component}-${issueType}`} epics={response.items} />

          {response.items.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-fb-text-secondary">Hiển thị {response.items.length} / {response.total} Epic</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Trang trước</Button>
                <span className="text-fb-text-secondary">Trang {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Trang sau</Button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
