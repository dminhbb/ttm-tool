'use client';

import { useState } from 'react';
import { ArrowCounterClockwise, Calculator, CaretRight, TextT } from '@phosphor-icons/react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { computeEpicComplexity } from '@/lib/epic-complexity';
import { EPIC_COMPLEXITY_LABELS } from '@/lib/status-alert-rule-types';
import { phaseDisplayLabel, type CalculatorPhaseRow, type TtmCalculatorResult } from '@/lib/ttm-calculator';
import { CALCULATOR_REQUEST_TYPES, parseCalculatorText, type CalculatorTextResult } from '@/lib/ttm-calculator-text';
import { cn } from '@/lib/utils';
import { TtmPhaseTimeline } from '@/components/ttm-calculator/TtmPhaseTimeline';

interface FormState {
  createdDate: string;
  ideaApprovedDate: string;
  requestType: string;
  requirementLevel: string;
  startDate: string;
}

const INITIAL_FORM: FormState = { createdDate: '', ideaApprovedDate: '', requestType: CALCULATOR_REQUEST_TYPES[1], requirementLevel: '2', startDate: '' };
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Màu nền của ô pha trong Bảng Pha, khớp màu từng pha trên timeline (REQ-20261119-02). */
const PHASE_CELL_BG: Record<CalculatorPhaseRow['key'], string> = {
  DESIGN: '#e0f2fe', // sky-100
  DEV: '#dcfce7', // green-100
  TEST: '#fef9c3', // yellow-100
  PENTEST: '#ffedd5', // orange-100
  R4GOLIVE: '#dbeafe', // blue-100
  GOLIVE: '#ede9fe', // violet-100
};

/** "T4 11/11/2026" from "2026-11-11". */
function formatDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return '—';
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()];
  return `${weekday} ${match[3]}/${match[2]}/${match[1]}`;
}

function formatPlainDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function Widget({ accent = false, label, value }: { accent?: boolean; label: string; value: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col items-center gap-1 rounded-xl border text-center border-fb-border bg-fb-surface p-3.5 shadow-sm', accent && 'bg-fb-blue-soft')}>
      <span className="text-xs text-fb-text-secondary">{label}</span>
      <span className={cn('truncate text-base font-bold', accent ? 'text-fb-blue' : 'text-fb-text-primary')}>{value}</span>
    </div>
  );
}

function ExplanationRow({ result }: { result: TtmCalculatorResult }) {
  const e2e = result.e2e;
  const phaseText = result.rows.map((row) => `${phaseDisplayLabel(row.key)} ${row.workingDays} ngày`).join(', ');
  return (
    <Alert title="Cách phân loại, rule áp dụng và cách tính">
      {/* Chữ giải thích dùng cỡ chữ thường, không đậm (bỏ <b>) theo yêu cầu chủ sản phẩm 19/11/2026. */}
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-xs text-fb-text-primary">
        <li>Epic được phân loại {EPIC_COMPLEXITY_LABELS[result.complexity]}.</li>
        <li>
          Áp dụng Rule Group {result.ruleGroup.name}{result.ruleGroup.isDefault ? ' (nhóm mặc định)' : ` (ưu tiên ${result.ruleGroup.priority})`}
          {result.rules.cnttName ? <>, rule {result.rules.cnttName} (bộ ngân sách {result.rules.cnttPolicySet}): tổng thời gian TTM-CNTT {result.totalCnttWorkingDays ?? '—'} ngày làm việc.</> : <>; không có rule TTM-CNTT nên chưa tính được mốc.</>}
        </li>
        {result.r4gDate && (
          <li>R4G mục tiêu {formatDay(result.r4gDate)}, hạn golive {formatDay(result.goliveDate)} (R4G + {result.graceWorkingDays} ngày làm việc). Các pha: {phaseText}.</li>
        )}
        <li>
          {e2e?.budgetWorkingDays
            ? <>TTM-E2E {e2e.budgetWorkingDays} ngày làm việc, tính từ {e2e.sourceLabel} {formatDay(e2e.sourceDate)}, đến hạn {formatDay(e2e.targetDate)}.</>
            : 'Chưa tính TTM-E2E: cần Ngày duyệt ý tưởng hoặc Created date (và bộ ngân sách TTM-E2E của loại Epic này).'}
        </li>
        {result.startIsNonWorkingDay && result.totalCnttWorkingDays != null && (
          <li>
            Lưu ý: Start date rơi vào Thứ 7 / Chủ nhật / ngày nghỉ. Ứng dụng vẫn coi đó là ngày thứ nhất (giống Epic thật) nhưng ngày đó không phải ngày làm việc, nên thực tế chỉ có {result.totalCnttWorkingDays - 1} ngày làm việc và R4G trùng với khi bắt đầu từ ngày làm việc liền trước.
          </li>
        )}
      </ul>
    </Alert>
  );
}

export function TtmCalculatorScreen() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<CalculatorTextResult | null>(null);
  const [result, setResult] = useState<TtmCalculatorResult | null>(null);
  // Ngày nghỉ / ngày làm bù (theo cấu hình) trả về cùng result, dùng để vẽ timeline.
  const [holidays, setHolidays] = useState<ReadonlySet<string>>(new Set());
  const [workdays, setWorkdays] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Cách nhập mà kết quả bên phải đang lấy thông tin từ đó.
  const [source, setSource] = useState<'form' | 'text' | null>(null);

  const setField = (key: keyof FormState) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function calculate(next: FormState, from: 'form' | 'text') {
    setError(null);
    if (!next.startDate) {
      setError('Vui lòng nhập Start date.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/ttm-calculator', {
        body: JSON.stringify({ createdDate: next.createdDate, ideaApprovedDate: next.ideaApprovedDate, requestType: next.requestType, requirementLevel: next.requirementLevel, startDate: next.startDate }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; result?: TtmCalculatorResult; holidays?: string[]; workdays?: string[] };
      if (!response.ok || !data.result) throw new Error(data.error ?? 'Không thể tính toán các mốc TTM.');
      setResult(data.result);
      setHolidays(new Set(data.holidays ?? []));
      setWorkdays(new Set(data.workdays ?? []));
      setSource(from);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tính toán các mốc TTM.');
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setForm(INITIAL_FORM);
    setText('');
    setParsed(null);
    setResult(null);
    setHolidays(new Set());
    setWorkdays(new Set());
    setSource(null);
    setError(null);
  }

  function parseText() {
    if (!text.trim()) {
      setError('Vui lòng nhập đoạn text, ví dụ "Cải tiến, Level 2, 11/11/2026".');
      return;
    }
    setError(null);
    setParsed(parseCalculatorText(text, new Date().getFullYear()));
  }

  function acceptParsed() {
    if (!parsed?.requestType || !parsed.level || !parsed.startDate) return;
    const next: FormState = { ...form, requestType: parsed.requestType, requirementLevel: parsed.level, startDate: parsed.startDate };
    setForm(next);
    setParsed(null);
    void calculate(next, 'text');
  }

  const parsedComplexity = parsed?.requestType && parsed.level ? computeEpicComplexity(parsed.requestType, parsed.level) : null;
  const canAccept = Boolean(parsed?.requestType && parsed.level && parsed.startDate);
  const e2e = result?.e2e ?? null;
  // Nút "Tính toán" của cách nhập đang cho ra kết quả → hồng; của cách còn lại → xám; chưa tính → mặc định.
  const calcButtonClass = (way: 'form' | 'text') => (source === null ? '' : source === way ? 'bg-[hsl(330_65%_52%)]! border-[hsl(330_65%_52%)]! text-white! hover:bg-[hsl(330_65%_44%)]!' : 'bg-fb-control-hover! border-fb-border-strong! text-fb-text-secondary!');

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        {/* Panel trái — nhập thông tin (nền tối hơn) */}
        <aside className="flex flex-col gap-5 rounded-xl border border-fb-border bg-[color-mix(in_srgb,var(--color-fb-control)_85%,black)] p-4">
          <section className="flex flex-col gap-3">
            <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-fb-text-primary"><Calculator className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />Cách 1: Nhập bằng form</h3>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void calculate(form, 'form');
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <Select className="min-w-0" label="Loại yêu cầu *" onChange={(event) => setField('requestType')(event.target.value)} options={CALCULATOR_REQUEST_TYPES.map((value) => ({ label: value, value }))} value={form.requestType} />
                <Select className="min-w-0" label="Requirement level *" onChange={(event) => setField('requirementLevel')(event.target.value)} options={['1', '2', '3', '4'].map((value) => ({ label: value, value }))} value={form.requirementLevel} />
                <Input className="min-w-0" label="Start date *" onChange={(event) => setField('startDate')(event.target.value)} type="date" value={form.startDate} />
                <Input className="min-w-0" label="Created date" onChange={(event) => setField('createdDate')(event.target.value)} type="date" value={form.createdDate} />
                <Input className="min-w-0" label="Ngày duyệt ý tưởng" onChange={(event) => setField('ideaApprovedDate')(event.target.value)} type="date" value={form.ideaApprovedDate} />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className={cn('flex-1', calcButtonClass('form'))} isLoading={loading} type="submit" icon={<Calculator className="size-4" weight="bold" aria-hidden="true" />}>Tính toán</Button>
                <Button variant="secondary" onClick={clearAll} type="button" icon={<ArrowCounterClockwise className="size-4" weight="bold" aria-hidden="true" />}>Clear</Button>
              </div>
            </form>
          </section>

          <hr className="m-0 border-0 border-t border-fb-border" />

          <section className="flex flex-col gap-3">
            <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-fb-text-primary"><TextT className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />Cách 2: Nhập bằng text</h3>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                parseText();
              }}
            >
              <Input
                helperText="Gồm Loại yêu cầu (tên đầy đủ, không dấu hoặc viết tắt như tnm/sp/ct/dv/qt…), Level 1-4 và Start date (31/7, 31/07/2026, 31/7/26…). Created date và Ngày duyệt ý tưởng lấy từ form phía trên."
                label="Đoạn text"
                onChange={(event) => setText(event.target.value)}
                placeholder="Cải tiến, Level 2, 11/11/2026"
                value={text}
              />
              <div className="flex gap-2">
                <Button variant="primary" className={cn('flex-1', calcButtonClass('text'))} type="submit" icon={<Calculator className="size-4" weight="bold" aria-hidden="true" />}>Tính toán</Button>
                <Button variant="secondary" onClick={clearAll} type="button" icon={<ArrowCounterClockwise className="size-4" weight="bold" aria-hidden="true" />}>Clear</Button>
              </div>
            </form>
          </section>
          {error && <Alert title="Chưa tính được" variant="error">{error}</Alert>}
        </aside>

        {/* Panel phải — kết quả (trống cho đến khi tính toán) */}
        <section className="flex min-h-[320px] min-w-0 flex-col gap-4 rounded-xl border border-fb-border bg-fb-surface p-4">
          {!result ? (
            <div className="flex flex-1 items-center justify-center text-sm text-fb-text-secondary">Nhập thông tin Epic</div>
          ) : (
            <>
              <ExplanationRow result={result} />

              <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-3">
                <Widget label="Start Date" value={formatDay(result.startDate)} />
                <Widget accent label="R4G mục tiêu" value={formatDay(result.r4gDate)} />
                <Widget label="Hạn golive" value={formatDay(result.goliveDate)} />
                <Widget label="Loại Epic" value={result.complexity} />
                <Widget label="Tổng thời gian TTM-CNTT" value={result.totalCnttWorkingDays ? `${result.totalCnttWorkingDays} ngày LV` : '—'} />
                <Widget label="Tổng thời gian TTM-E2E" value={e2e?.budgetWorkingDays ? `${e2e.budgetWorkingDays} ngày LV` : '—'} />
              </div>

              {result.rows.length > 0 && result.goliveDate && (
                <TtmPhaseTimeline
                  goliveDate={result.goliveDate}
                  holidays={holidays}
                  rows={result.rows}
                  startDate={result.startDate}
                  startIsNonWorkingDay={result.startIsNonWorkingDay}
                  workdays={workdays}
                />
              )}

              {result.rows.length === 0 && <Alert title="Chưa có mốc pha" variant="warning">Bộ ngân sách TTM-CNTT chưa có dòng cho loại Epic {result.complexity}.</Alert>}

              {result.rows.length > 0 && (
                <TableContainer>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Pha</TH>
                        <TH className="text-right">Ngày LV</TH>
                        <TH>Từ</TH>
                        <TH>Đến</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {result.rows.map((row) => (
                        <TR key={row.key}>
                          {/* Ô pha: màu nền khớp từng pha trên timeline + tên hiển thị (PENTEST → 'Pentest & Change'). */}
                          <TD className={cn(row.key === 'R4GOLIVE' && 'font-bold text-fb-blue')} style={{ backgroundColor: PHASE_CELL_BG[row.key] }}>{phaseDisplayLabel(row.key)}{row.percent !== null ? ` (${row.percent}%)` : ''}</TD>
                          <TD className={cn('text-right', row.key === 'R4GOLIVE' && 'font-bold text-fb-blue')}>{row.workingDays}</TD>
                          <TD className={cn(row.key === 'R4GOLIVE' && 'font-bold text-fb-blue')}>{formatDay(row.fromDate)}</TD>
                          <TD>{row.key === 'R4GOLIVE' ? '' : formatDay(row.toDate)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </section>
      </div>

      <Modal
        footer={
          <>
            <Button variant="secondary" onClick={() => setParsed(null)}>Huỷ</Button>
            <Button disabled={!canAccept} onClick={acceptParsed} variant="primary">Đồng ý và tính toán</Button>
          </>
        }
        icon={TextT}
        isOpen={parsed !== null}
        onClose={() => setParsed(null)}
        title="Kết quả phân tích đoạn text"
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="m-0 flex items-center gap-1 text-fb-text-secondary"><CaretRight className="size-3" aria-hidden="true" />{text}</p>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-fb-text-secondary">Loại Epic</dt>
            <dd className="m-0 font-semibold">{parsedComplexity ? EPIC_COMPLEXITY_LABELS[parsedComplexity] : '—'}{parsed?.requestType ? ` (Loại yêu cầu: ${parsed.requestType})` : ''}</dd>
            <dt className="text-fb-text-secondary">Requirement level</dt>
            <dd className="m-0 font-semibold">{parsed?.level ?? '—'}</dd>
            <dt className="text-fb-text-secondary">Start date</dt>
            <dd className="m-0 font-semibold">{parsed?.startDate ? formatPlainDate(parsed.startDate) : '—'}</dd>
            <dt className="text-fb-text-secondary">Created date</dt>
            <dd className="m-0">{form.createdDate ? formatPlainDate(form.createdDate) : '—'} <span className="text-fb-text-secondary">(từ form)</span></dd>
            <dt className="text-fb-text-secondary">Ngày duyệt ý tưởng</dt>
            <dd className="m-0">{form.ideaApprovedDate ? formatPlainDate(form.ideaApprovedDate) : '—'} <span className="text-fb-text-secondary">(từ form)</span></dd>
          </dl>
          {parsed && parsed.problems.length > 0 && (
            <Alert title="Chưa nhận dạng được" variant="error">
              <ul className="m-0 list-disc pl-4">{parsed.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </Alert>
          )}
        </div>
      </Modal>
    </div>
  );
}
