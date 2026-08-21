'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ChartBar, Clock, Gauge, WarningCircle } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EpicBrowserModal } from '@/components/epic-browser/EpicBrowserModal';
import { DASHBOARD_MAX_SELECTABLE_PROJECTS, DASHBOARD_MIN_SELECTABLE_PROJECTS } from '@/lib/dashboard-types';
import type { DashboardAtRiskEpic, DashboardResponse, DashboardStats } from '@/lib/dashboard-types';
import type { AlertLevel } from '@/lib/ttm-rules';

function formatDateTime(value: string | null): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()} ${hour}:${minute}`;
}

function StatTile({ icon: Icon, label, tone = 'neutral', value }: { icon: typeof Gauge; label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger'; value: string | number }) {
  const toneClass = {
    neutral: 'text-fb-text-primary',
    success: 'text-status-success',
    warning: 'text-status-warning',
    danger: 'text-status-danger',
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-fb-border bg-fb-surface-muted px-4 py-3">
      <Icon className={`size-6 shrink-0 ${toneClass}`} weight="bold" aria-hidden="true" />
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-tight ${toneClass}`}>{value}</p>
        <p className="truncate text-xs text-fb-text-secondary">{label}</p>
      </div>
    </div>
  );
}

function StatusDistributionBars({ data }: { data: DashboardStats['statusDistribution'] }) {
  if (data.length === 0) return <p className="text-sm text-fb-text-secondary">Không có Epic nào.</p>;
  const max = Math.max(...data.map((item) => item.count));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((item) => (
        <li key={item.status} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-xs text-fb-text-secondary" title={item.status}>{item.status || '—'}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-fb-surface-muted">
            <span className="block h-full rounded-full bg-fb-blue" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-fb-text-primary">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

const AT_RISK_BADGE_VARIANT: Record<AlertLevel, 'danger' | 'warning' | 'info' | 'neutral'> = {
  FAIL: 'danger',
  LATE: 'warning',
  EARLY: 'info',
  NONE: 'neutral',
};
const AT_RISK_BADGE_LABEL: Record<AlertLevel, string> = {
  FAIL: 'Fail TTM-CNTT',
  LATE: 'Cảnh báo muộn',
  EARLY: 'Cảnh báo sớm',
  NONE: '',
};

function AtRiskList({ items, onOpenEpic, showProject }: { items: DashboardAtRiskEpic[]; onOpenEpic: (epicKey: string) => void; showProject: boolean }) {
  if (items.length === 0) return <p className="text-sm text-fb-text-secondary">Không có Epic nào đang cảnh báo.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.epicKey} className="flex flex-wrap items-center gap-2 rounded-md border border-fb-border px-3 py-2">
          <button type="button" onClick={() => onOpenEpic(item.epicKey)} className="font-bold text-fb-blue hover:underline">{item.epicKey}</button>
          {showProject && <Badge variant="neutral">{item.projectKey}</Badge>}
          <span className="min-w-0 flex-1 truncate text-sm text-fb-text-secondary" title={item.epicName}>{item.epicName}</span>
          {item.alertLevel !== 'NONE' && <Badge variant={AT_RISK_BADGE_VARIANT[item.alertLevel]}>{AT_RISK_BADGE_LABEL[item.alertLevel]}</Badge>}
          {item.ttmE2eAlertLevel === 'FAIL' && <Badge variant="danger">Fail TTM-E2E</Badge>}
          {item.remainingWorkingDays !== null && (
            <span className="text-xs text-fb-text-secondary">
              {item.remainingWorkingDays >= 0 ? `Còn ${item.remainingWorkingDays} ngày làm việc` : `Trễ ${-item.remainingWorkingDays} ngày làm việc`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DashboardStatsPanel({ onOpenEpic, showProjectInAtRisk, stats, subtitle, title }: { onOpenEpic: (epicKey: string) => void; showProjectInAtRisk: boolean; stats: DashboardStats; subtitle?: string; title: string }) {
  const achievedRate = stats.achievedTtmEligibleCount > 0 ? Math.round((stats.achievedTtmCount / stats.achievedTtmEligibleCount) * 100) : null;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{subtitle && <span className="text-xs text-fb-text-secondary">{subtitle}</span>}</CardHeader>
      <CardBody className="gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Gauge} label="Tổng số Epic" value={stats.epicCount} />
          <StatTile icon={WarningCircle} label="Fail TTM-CNTT" tone="danger" value={stats.alerts.failCntt} />
          <StatTile icon={WarningCircle} label="Fail TTM-E2E" tone="danger" value={stats.alerts.failE2e} />
          <StatTile icon={WarningCircle} label="Cảnh báo muộn" tone="warning" value={stats.alerts.lateWarning} />
          <StatTile icon={WarningCircle} label="Cảnh báo sớm" tone="warning" value={stats.alerts.earlyWarning} />
          <StatTile icon={Clock} label="Sắp đến hạn (≤5 ngày)" tone="warning" value={stats.upcomingDeadlineCount} />
          <StatTile icon={CheckCircle} label="Đạt TTM" tone="success" value={achievedRate !== null ? `${stats.achievedTtmCount}/${stats.achievedTtmEligibleCount} (${achievedRate}%)` : '—'} />
          <StatTile icon={WarningCircle} label="Thiếu dữ liệu chuẩn" value={stats.missingDataCount} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fb-text-primary"><ChartBar className="size-4" weight="bold" aria-hidden="true" />Phân bố trạng thái Epic</h4>
            <StatusDistributionBars data={stats.statusDistribution} />
            <p className="mt-3 text-xs text-fb-text-secondary">Epic phức tạp: <strong className="text-fb-text-primary">{stats.complexity.complex}</strong> · Epic đơn giản: <strong className="text-fb-text-primary">{stats.complexity.simple}</strong></p>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-fb-text-primary">Epic cần chú ý nhất</h4>
            <AtRiskList items={stats.topAtRisk} onOpenEpic={onOpenEpic} showProject={showProjectInAtRisk} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [browsingEpicKey, setBrowsingEpicKey] = useState<string | null>(null);

  const fetchDashboard = async (projects?: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = projects && projects.length > 0 ? `/api/dashboard?projects=${projects.map(encodeURIComponent).join(',')}` : '/api/dashboard';
      const response = await fetch(url);
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Lỗi hệ thống khi tải Dashboard.'); return; }
      setData(result as DashboardResponse);
      if ((result as DashboardResponse).selectedProjects.length > 0) setPendingSelection((result as DashboardResponse).selectedProjects);
    } catch {
      setError('Không thể kết nối API Dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(() => fetchDashboard()); }, []);

  const projectOptions = useMemo(
    () => (data?.availableProjects ?? []).map((project) => ({ value: project.projectKey, label: `${project.projectKey} — ${project.projectName} (${project.epicCount} Epic)` })),
    [data],
  );

  if (isLoading && !data) return <TableSkeleton rows={6} />;
  if (error && !data) return <Alert variant="error" title="Lỗi">{error}</Alert>;
  if (!data) return null;

  const needsGate = data.requiresSelection && !data.overall;

  if (needsGate) {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <div className="max-w-lg text-center">
          <Gauge className="mx-auto mb-3 size-10 text-fb-blue" weight="bold" aria-hidden="true" />
          <h2 className="text-xl font-bold text-fb-text-primary">Welcome to Dashboard</h2>
          <p className="mt-2 text-sm text-fb-text-secondary">
            Chọn từ {DASHBOARD_MIN_SELECTABLE_PROJECTS} đến {DASHBOARD_MAX_SELECTABLE_PROJECTS} dự án (Project Key) để xem thống kê TTM.
          </p>
        </div>
        {error && <Alert variant="error" title="Lỗi">{error}</Alert>}
        {projectOptions.length === 0 ? (
          <EmptyState title="Chưa có dự án nào" description="Bạn chưa được phân quyền dự án nào có dữ liệu Epic." />
        ) : (
          <div className="w-full max-w-lg">
            <MultiSelect
              label="Project Key"
              onChange={(values) => setPendingSelection(values.slice(0, DASHBOARD_MAX_SELECTABLE_PROJECTS))}
              options={projectOptions}
              placeholder="Chọn dự án"
              value={pendingSelection}
            />
            <Button className="mt-4 w-full" disabled={pendingSelection.length < DASHBOARD_MIN_SELECTABLE_PROJECTS} isLoading={isLoading} onClick={() => void fetchDashboard(pendingSelection)}>
              Xem Dashboard
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variant="error" title="Lỗi">{error}</Alert>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-fb-text-secondary">Dữ liệu tính đến lớp: <strong className="text-fb-text-primary">{formatDateTime(data.lastAggregatedAt)}</strong></p>
        {data.requiresSelection && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64">
              <MultiSelect
                label="Đổi dự án đang xem"
                onChange={(values) => setPendingSelection(values.slice(0, DASHBOARD_MAX_SELECTABLE_PROJECTS))}
                options={projectOptions}
                placeholder="Chọn dự án"
                value={pendingSelection}
              />
            </div>
            <Button disabled={pendingSelection.length < DASHBOARD_MIN_SELECTABLE_PROJECTS} isLoading={isLoading} onClick={() => void fetchDashboard(pendingSelection)} size="sm">
              Cập nhật
            </Button>
          </div>
        )}
      </div>

      {data.overall && <DashboardStatsPanel onOpenEpic={setBrowsingEpicKey} showProjectInAtRisk={data.perProject.length > 1} stats={data.overall} title="Tổng quan các dự án đã chọn" />}

      {data.perProject.length === 0 ? (
        <EmptyState title="Không có Epic nào" description="Các dự án đã chọn hiện chưa có Epic." />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.perProject.map((project) => (
            <DashboardStatsPanel
              key={project.projectKey}
              onOpenEpic={setBrowsingEpicKey}
              showProjectInAtRisk={false}
              stats={project}
              title={`${project.projectKey} — ${project.projectName}`}
            />
          ))}
        </div>
      )}

      <EpicBrowserModal epicKey={browsingEpicKey} onClose={() => setBrowsingEpicKey(null)} />
    </div>
  );
}
