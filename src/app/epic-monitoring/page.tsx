"use client";

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { EpicMonitoringResponse, MonitoredEpic } from '@/lib/epic-monitoring-types';
import type { AlertLevel } from '@/lib/ttm-rules';
import { ALERT_LABELS } from '@/lib/ttm-rules';

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function alertBadgeVariant(level: AlertLevel): 'danger' | 'warning' | 'info' | 'neutral' {
  if (level === 'FAIL') return 'danger';
  if (level === 'LATE') return 'warning';
  if (level === 'EARLY') return 'info';
  return 'neutral';
}

function CommonCells({ epic }: { epic: MonitoredEpic }) {
  return (
    <>
      <TD className="text-center">
        {epic.alertLevel !== 'NONE' && <Badge variant={alertBadgeVariant(epic.alertLevel)}>{ALERT_LABELS[epic.alertLevel]}</Badge>}
      </TD>
      <TD className="font-bold text-fb-blue">{epic.epicKey}</TD>
      <TD className="max-w-[260px] truncate font-medium" title={epic.epicName}>{epic.epicName}</TD>
      <TD>{epic.status}</TD>
      <TD>{epic.domain || '-'}</TD>
      <TD>{epic.project || '-'}</TD>
      <TD>{epic.assignee || '-'}</TD>
      <TD>{epic.epicType || '-'}</TD>
      <TD>{epic.requirementLevel || '-'}</TD>
      <TD>{formatDate(epic.ideaApprovedDate)}</TD>
      <TD>{formatDate(epic.startDate)}</TD>
      <TD className="text-center">
        {epic.missingStandardInfo.length > 0 ? (
          <span className="text-status-warning" title={epic.missingStandardInfo.join(', ')}>{epic.missingStandardInfo.length}</span>
        ) : '-'}
      </TD>
    </>
  );
}

const COMMON_HEADERS = ['Risk', 'Epic Key', 'Epic Name', 'Status', 'Domain', 'Dự án', 'Owner', 'Epic Type', 'Requirement Level', 'T0', 'T1', 'Missing'];

function Panel1Table({ epics }: { epics: MonitoredEpic[] }) {
  if (epics.length === 0) {
    return <EmptyState title="Không có Epic nào" description="Không có Epic đã có Start Date trong khoảng ngày đã chọn." />;
  }
  return (
    <TableContainer>
      <Table className="min-w-[1400px]">
        <THead>
          <TR>
            {COMMON_HEADERS.map((h) => <TH key={h}>{h}</TH>)}
            <TH>Target R4G</TH>
            <TH>R4G Date</TH>
            <TH className="text-center">Ngày làm việc còn lại</TH>
          </TR>
        </THead>
        <TBody>
          {epics.map((epic) => (
            <TR key={epic.epicKey}>
              <CommonCells epic={epic} />
              <TD>{formatDate(epic.targetR4gDate)}</TD>
              <TD>{formatDate(epic.r4gDate)}</TD>
              <TD className="text-center font-bold">{epic.daysRemaining ?? '-'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

function Panel2Table({ epics }: { epics: MonitoredEpic[] }) {
  if (epics.length === 0) {
    return <EmptyState title="Không có Epic nào" description="Không có Epic thiếu Start Date trong khoảng ngày đã chọn." />;
  }
  return (
    <TableContainer>
      <Table className="min-w-[1300px]">
        <THead>
          <TR>
            {COMMON_HEADERS.map((h) => <TH key={h}>{h}</TH>)}
            <TH className="text-center">Số ngày kể từ T0</TH>
          </TR>
        </THead>
        <TBody>
          {epics.map((epic) => (
            <TR key={epic.epicKey}>
              <CommonCells epic={epic} />
              <TD className="text-center font-bold">{epic.daysSinceT0 ?? '-'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

function Panel3Table({ epics }: { epics: MonitoredEpic[] }) {
  if (epics.length === 0) {
    return <EmptyState title="Không có Epic nào" description="Không có Epic ở trạng thái To Do trong khoảng ngày đã chọn." />;
  }
  return (
    <TableContainer>
      <Table className="min-w-[1300px]">
        <THead>
          <TR>
            {COMMON_HEADERS.map((h) => <TH key={h}>{h}</TH>)}
            <TH className="text-center">Số ngày kể từ T0</TH>
          </TR>
        </THead>
        <TBody>
          {epics.map((epic) => (
            <TR key={epic.epicKey}>
              <CommonCells epic={epic} />
              <TD className="text-center font-bold">{epic.daysSinceT0 ?? '-'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

export default function EpicMonitoringPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [data, setData] = useState<EpicMonitoringResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/epic-monitoring?from=${from}&to=${to}`);
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || 'Lỗi hệ thống khi tải dữ liệu.');
      } else {
        setData(result);
      }
    } catch {
      setError('Không thể kết nối API Epic Monitoring.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardBody className="flex-row flex-nowrap items-end gap-3 overflow-x-auto">
          <Input type="date" label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[170px] shrink-0" />
          <span className="mb-2.5 shrink-0 text-fb-text-secondary">&rarr;</span>
          <Input type="date" label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} className="w-[170px] shrink-0" />
          <Button type="button" onClick={fetchData} className="shrink-0">Áp dụng</Button>
        </CardBody>
      </Card>

      {error && (
        <Alert variant="error" title="Không thể tải dữ liệu">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Card><CardBody><TableSkeleton rows={5} /></CardBody></Card>
      ) : data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Panel 1 — Epic đã có Start Date ({data.panel1.length})</CardTitle>
            </CardHeader>
            <CardBody><Panel1Table epics={data.panel1} /></CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Panel 2 — Thiếu Start Date, đã qua To Do ({data.panel2.length})</CardTitle>
            </CardHeader>
            <CardBody><Panel2Table epics={data.panel2} /></CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Panel 3 — Backlog (To Do) ({data.panel3.length})</CardTitle>
            </CardHeader>
            <CardBody><Panel3Table epics={data.panel3} /></CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
