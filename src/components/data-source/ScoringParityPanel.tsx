'use client';

import { useEffect, useState } from 'react';
import { ArrowsClockwise, Scales, ToggleRight } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

interface ParityDiff { check: string; legacy: string; scoring: string; tag: string }
interface ParitySummary {
  asOf: string;
  epicCount: number;
  identicalEpics: number;
  epicsWithIntentionalDiffsOnly: number;
  epicsWithUnexplainedDiffs: number;
  byTag: Record<string, number>;
  byCheck: Record<string, { intentional: number; unexplained: number }>;
  unexplainedSamples: { epicKey: string; diffs: ParityDiff[] }[];
  intentionalSamples: { epicKey: string; diffs: ParityDiff[] }[];
}
interface EngineSettings { mode: 'legacy' | 'scoring'; updatedAt: string | null; updatedByName: string | null }
interface ParityRun {
  id: number;
  asOf: string;
  source: string;
  rulesetVersion: string;
  epicCount: number;
  identicalEpics: number;
  intentionalOnlyEpics: number;
  unexplainedEpics: number;
  summary: ParitySummary;
  durationMs: number | null;
  computedAt: string;
  triggeredByName: string | null;
}

const TAG_LABEL: Record<string, string> = {
  D1_INDEX_PASS: 'D1 — Index không đếm Sai Status / R4G tương lai là Đạt',
  D3_PHASE_AS_OF: 'D3 — Hoàn thành pha theo asOf',
  D4_EARLY_REMOVED: 'D4 — Bỏ "Cảnh báo sớm"',
  D5_TARGET_N_MINUS_1: 'D5 — Target_CNTT = T1 +wd (N − 1)',
  R2_R7_NOT_ANOMALY: 'R2/R7 không còn là Sai lệch dữ liệu',
  LEGACY_TIME_OF_DAY: 'Logic cũ lệch múi giờ khi ngày kết thúc = hạn',
  CANCELLED_NOT_APPLICABLE: 'Epic Cancelled: "Không áp dụng" thay vì "Đạt"',
  D7_WAITING_GOLIVE_REDEFINED: 'D7 — "Chờ golive" tính theo status',
  D8_ANOMALY_CHECKED_FIRST: 'D8 — Sai lệch dữ liệu xét trước, không chấm Đạt/Fail',
  D9_E2E_RULE_REDEFINED: 'D9 — TTM-E2E: Target N − 1, bỏ điều kiện Released',
  UNEXPLAINED: 'Chưa giải thích được',
};

const SOURCE_LABEL: Record<string, string> = {
  'cache-refresh': 'Tự động (tạo cache)',
  manual: 'Thủ công',
  'manual-historical': 'Thủ công (quá khứ)',
};

function formatDay(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SampleTable({ samples }: { samples: { epicKey: string; diffs: ParityDiff[] }[] }) {
  return (
    <TableContainer>
      <Table className="min-w-[760px]">
        <THead>
          <TR><TH className="w-[120px]">Epic</TH><TH>Hạng mục</TH><TH className="w-[130px]">Logic cũ</TH><TH className="w-[130px]">Scoring</TH><TH>Phân loại</TH></TR>
        </THead>
        <TBody>
          {samples.flatMap((sample) => sample.diffs.map((diff, index) => (
            <TR key={`${sample.epicKey}-${index}`}>
              <TD className="font-bold text-fb-blue">{index === 0 ? sample.epicKey : ''}</TD>
              <TD>{diff.check}</TD>
              <TD>{diff.legacy}</TD>
              <TD>{diff.scoring}</TD>
              <TD><Badge variant={diff.tag === 'UNEXPLAINED' ? 'danger' : 'info'}>{TAG_LABEL[diff.tag] ?? diff.tag}</Badge></TD>
            </TR>
          )))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

/**
 * "Đối chiếu Scoring Service" — the parallel-run check between the new Epic Scoring Service and the
 * legacy engine (see scoring-run-service.ts). Every cache rebuild records one run automatically; a
 * SUPERADMIN can also run one for any past date.
 */
export function ScoringParityPanel() {
  const [runs, setRuns] = useState<ParityRun[]>([]);
  const [today, setToday] = useState('');
  const [asOf, setAsOf] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineSettings | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [res, modeRes] = await Promise.all([
        fetch('/api/admin/scoring/parity', { cache: 'no-store' }),
        fetch('/api/admin/scoring/mode', { cache: 'no-store' }),
      ]);
      const body = await res.json();
      if (!res.ok) setError(body.error || 'Không đọc được kết quả đối chiếu.');
      else { setRuns(body.runs); setToday(body.today); setAsOf((current) => current || body.today); }
      if (modeRes.ok) setEngine(await modeRes.json());
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsLoading(false);
    }
  };

  const run = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/scoring/parity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asOf }) });
      const body = await res.json();
      if (!res.ok) setError(body.error || 'Đối chiếu thất bại.');
      else await load();
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsRunning(false);
    }
  };

  const switchEngine = async (mode: 'legacy' | 'scoring') => {
    setIsSwitching(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/scoring/mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      const body = await res.json();
      if (!res.ok) setError(body.error || 'Không đổi được chế độ hiển thị.');
      else {
        setEngine(body);
        setNotice('Đã đổi chế độ. Cache đang được tạo lại ở nền (khoảng 1 phút); các màn hình hiển thị theo chế độ mới sau khi cache xong.');
      }
    } catch {
      setError('Không thể kết nối API.');
    } finally {
      setIsSwitching(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const latest = runs[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đối chiếu Scoring Service</CardTitle>
        <Button variant="outline" size="sm" isLoading={isLoading} onClick={() => void load()}>
          <ArrowsClockwise className="mr-1.5 inline size-4" />
          Làm mới
        </Button>
      </CardHeader>
      <CardBody className="gap-4">
        <p className="text-fb-text-secondary">
          Scoring Service đang chạy song song với logic cảnh báo hiện tại: mỗi lần tạo cache, mọi Epic được chấm điểm lại và so sánh với logic cũ.
          Chênh lệch do các quyết định đã chốt (D1, D3, D4, D5, R2/R7) hoặc do lỗi đã biết của logic cũ được xếp là <strong>có chủ đích</strong>; chênh lệch còn lại là <strong>chưa giải thích được</strong> và cần xem trước khi chuyển màn hình sang Scoring Service.
        </p>

        {error && <Alert variant="error" title="Lỗi">{error}</Alert>}
        {notice && <Alert variant="info" title="Đang áp dụng">{notice}</Alert>}

        {engine && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fb-border p-3">
            <div className="min-w-[240px] flex-1">
              <p className="text-[11px] font-bold uppercase text-fb-text-secondary">Chế độ hiển thị trên các màn hình</p>
              <p className="mt-1 flex items-center gap-2 font-bold text-fb-text-primary">
                <Badge variant={engine.mode === 'scoring' ? 'success' : 'warning'}>{engine.mode === 'scoring' ? 'Scoring Service' : 'Logic cũ (legacy)'}</Badge>
                {engine.updatedAt && <span className="text-[12px] font-normal text-fb-text-secondary">đổi lúc {formatDateTime(engine.updatedAt)}{engine.updatedByName ? ` bởi ${engine.updatedByName}` : ''}</span>}
              </p>
              <p className="mt-1 text-[12px] text-fb-text-secondary">
                Áp dụng cho Quản trị Epic, Epic in PO, TTM Dashboard, Dashboard, Báo cáo Epic và MCP. Màn &quot;Quản trị Epic (rút gọn)&quot; luôn dùng logic cũ.
              </p>
            </div>
            <Button size="sm" variant={engine.mode === 'scoring' ? 'outline' : 'primary'} isLoading={isSwitching} onClick={() => void switchEngine(engine.mode === 'scoring' ? 'legacy' : 'scoring')}>
              <ToggleRight className="mr-1.5 inline size-4" />
              {engine.mode === 'scoring' ? 'Quay về logic cũ' : 'Chuyển sang Scoring Service'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[180px]">
            <Input label="Ngày đối chiếu (asOf)" type="date" value={asOf} max={today || undefined} onChange={(event) => setAsOf(event.target.value)} />
          </div>
          <Button size="sm" isLoading={isRunning} disabled={!asOf} onClick={() => void run()}>
            <Scales className="mr-1.5 inline size-4" />
            Chạy đối chiếu
          </Button>
        </div>

        {isLoading && !runs.length ? (
          <TableSkeleton rows={3} />
        ) : !latest ? (
          <EmptyState title="Chưa có lần đối chiếu nào" description="Lần đầu sẽ chạy khi cache được tạo lại, hoặc bấm &quot;Chạy đối chiếu&quot;." />
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Lần gần nhất — asOf {formatDay(latest.asOf)}</dt>
                <dd className="mt-1.5 font-bold text-fb-text-primary">{latest.epicCount} Epic</dd>
                <dd className="text-[12px] text-fb-text-secondary">{SOURCE_LABEL[latest.source] ?? latest.source} · {formatDateTime(latest.computedAt)}</dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Khớp hoàn toàn</dt>
                <dd className="mt-1.5 font-bold text-status-success">{latest.identicalEpics}</dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Chỉ lệch có chủ đích</dt>
                <dd className="mt-1.5 font-bold text-fb-text-primary">{latest.intentionalOnlyEpics}</dd>
              </div>
              <div className="rounded-xl border border-fb-border p-3">
                <dt className="text-[11px] font-bold uppercase text-fb-text-secondary">Chưa giải thích được</dt>
                <dd className={`mt-1.5 font-bold ${latest.unexplainedEpics ? 'text-status-danger' : 'text-status-success'}`}>{latest.unexplainedEpics}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-[12px] font-bold text-fb-text-primary">Số chênh lệch theo hạng mục (lần gần nhất)</p>
              <TableContainer>
                <Table className="min-w-[520px]">
                  <THead><TR><TH>Hạng mục</TH><TH className="w-[140px] text-right">Có chủ đích</TH><TH className="w-[160px] text-right">Chưa giải thích</TH></TR></THead>
                  <TBody>
                    {Object.entries(latest.summary.byCheck).sort((a, b) => b[1].unexplained - a[1].unexplained || b[1].intentional - a[1].intentional).map(([check, counts]) => (
                      <TR key={check}>
                        <TD>{check}</TD>
                        <TD className="text-right">{counts.intentional}</TD>
                        <TD className={`text-right ${counts.unexplained ? 'font-bold text-status-danger' : ''}`}>{counts.unexplained}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            </div>

            {latest.summary.unexplainedSamples.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] font-bold text-status-danger">Mẫu Epic lệch chưa giải thích được (tối đa 30)</p>
                <SampleTable samples={latest.summary.unexplainedSamples} />
              </div>
            )}
            {latest.summary.intentionalSamples.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[12px] font-bold text-fb-text-primary">Mẫu Epic lệch có chủ đích (tối đa 30)</summary>
                <div className="mt-2"><SampleTable samples={latest.summary.intentionalSamples} /></div>
              </details>
            )}

            <div>
              <p className="mb-2 text-[12px] font-bold text-fb-text-primary">Lịch sử đối chiếu</p>
              <TableContainer>
                <Table className="min-w-[760px]">
                  <THead>
                    <TR><TH className="w-[110px]">asOf</TH><TH>Nguồn</TH><TH className="w-[130px]">Lúc chạy</TH><TH className="w-[80px] text-right">Epic</TH><TH className="w-[90px] text-right">Khớp</TH><TH className="w-[110px] text-right">Có chủ đích</TH><TH className="w-[120px] text-right">Chưa giải thích</TH></TR>
                  </THead>
                  <TBody>
                    {runs.map((item) => (
                      <TR key={item.id}>
                        <TD className="font-bold text-fb-blue">{formatDay(item.asOf)}</TD>
                        <TD>{SOURCE_LABEL[item.source] ?? item.source}{item.triggeredByName ? ` — ${item.triggeredByName}` : ''}</TD>
                        <TD>{formatDateTime(item.computedAt)}</TD>
                        <TD className="text-right">{item.epicCount}</TD>
                        <TD className="text-right">{item.identicalEpics}</TD>
                        <TD className="text-right">{item.intentionalOnlyEpics}</TD>
                        <TD className={`text-right ${item.unexplainedEpics ? 'font-bold text-status-danger' : ''}`}>{item.unexplainedEpics}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
