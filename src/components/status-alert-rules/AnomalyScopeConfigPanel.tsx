'use client';

import { useEffect, useState } from 'react';
import { ArrowCounterClockwise, CaretDown } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import type { AnomalyRuleScope, AnomalyScopeConfig } from '@/lib/scoring/parameters';
import { DEFAULT_ANOMALY_SCOPE_CONFIG } from '@/lib/scoring/parameters';

interface Notice {
  text: string;
  type: 'error' | 'success';
}

export const ANOMALY_RULES: Array<{
  id: string;
  code: string;
  label: string;
  meaning: string;
}> = [
  { id: 'ANOMALY_R1_MISSING_START_DATE', code: 'R1', label: 'Thiếu Start Date', meaning: 'Epic đã từ Design trở đi nhưng chưa có Start Date (T1)' },
  { id: 'ANOMALY_R3_DATE_OUT_OF_SEQUENCE', code: 'R3', label: 'Sai thứ tự ngày', meaning: 'Các mốc ngày không theo đúng thứ tự (T0 ≤ T1 < R4G ≤ Due)' },
  { id: 'ANOMALY_R4_MISSING_REQUEST_TYPE', code: 'R4', label: 'Thiếu Phân loại yêu cầu', meaning: 'Chưa có Phân loại yêu cầu (trống hoặc none)' },
  { id: 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', code: 'R5', label: 'Thiếu Requirement Level', meaning: 'Epic đã qua Design nhưng chưa có Requirement Level' },
  { id: 'ANOMALY_R6_SP_LEVEL_MISMATCH', code: 'R6', label: 'SP nhưng Level thấp', meaning: 'Loại Epic SP (Sản phẩm) nhưng Requirement Level 1–2' },
  { id: 'ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', code: 'R8', label: 'Có R4G Date nhưng chưa R4GOLIVE', meaning: 'Đã ghi R4G Date nhưng status chưa lên R4GOLIVE (kể cả ngày tương lai)' },
  { id: 'ANOMALY_R9_MISSING_R4G_DATE', code: 'R9', label: 'Thiếu R4G Date', meaning: 'Status đã từ R4GOLIVE trở lên nhưng chưa có R4G Date' },
  { id: 'ANOMALY_R10_R4G_DATE_IN_FUTURE', code: 'R10', label: 'R4G Date ở tương lai', meaning: 'Status từ R4GOLIVE trở lên (hoặc Reopened) nhưng R4G Date còn ở tương lai' },
];

const readError = (value: unknown, fallback: string) =>
  typeof value === 'object' && value !== null && 'error' in value && typeof (value as { error: unknown }).error === 'string'
    ? (value as { error: string }).error
    : fallback;

interface AnomalyScopeConfigPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AnomalyScopeConfigPanel({ isOpen, onToggle }: AnomalyScopeConfigPanelProps) {
  const [config, setConfig] = useState<AnomalyScopeConfig>(DEFAULT_ANOMALY_SCOPE_CONFIG);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedByName: string | null }>({ updatedAt: null, updatedByName: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/anomaly-scope-config');
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể tải Phạm vi rule Sai lệch dữ liệu.'));
      const data = payload as { config: AnomalyScopeConfig; updatedAt: string | null; updatedByName: string | null };
      setConfig(data.config ?? DEFAULT_ANOMALY_SCOPE_CONFIG);
      setMeta({ updatedAt: data.updatedAt, updatedByName: data.updatedByName });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể tải Phạm vi rule Sai lệch dữ liệu.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/anomaly-scope-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readError(payload, 'Không thể lưu Phạm vi rule Sai lệch dữ liệu.'));
      showToast('Đã lưu Phạm vi rule Sai lệch dữ liệu — đang tính toán lại cache, có thể mất vài chục giây.', 6000);
      setNotice(null);
      await load();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu Phạm vi rule Sai lệch dữ liệu.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const updateRuleField = (ruleId: string, field: keyof Omit<AnomalyRuleScope, 'enabled'>, value: string) => {
    setConfig((prev) => {
      const currentRule = prev.rules[ruleId] ?? { enabled: false, createdAfter: null, startAfter: null, r4gAfter: null, dueAfter: null };
      return {
        ...prev,
        rules: {
          ...prev.rules,
          [ruleId]: {
            ...currentRule,
            [field]: value || null,
          },
        },
      };
    });
  };

  const updateRuleEnabled = (ruleId: string, enabled: boolean) => {
    setConfig((prev) => {
      const currentRule = prev.rules[ruleId] ?? { enabled: false, createdAfter: null, startAfter: null, r4gAfter: null, dueAfter: null };
      return {
        ...prev,
        rules: {
          ...prev.rules,
          [ruleId]: {
            ...currentRule,
            enabled,
          },
        },
      };
    });
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5">
          <CaretDown className={`size-4 text-fb-text-secondary transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Phạm vi rule Sai lệch dữ liệu</CardTitle>
              {config.enabled && (
                <Badge variant="success" className="text-[10px] font-semibold">
                  Master: Enabled
                </Badge>
              )}
            </div>
            <p className="mt-1 text-fb-text-secondary text-xs">
              Thiết lập phạm vi áp dụng các rule Sai lệch dữ liệu theo mốc ngày. Chỉ các Epic thoả mãn điều kiện mới bị đánh giá sai lệch dữ liệu.
            </p>
          </div>
        </div>
      </CardHeader>
      {isOpen && (
        <CardBody className="flex flex-col gap-4">
          {loading ? (
            <TableSkeleton rows={4} />
          ) : (
            <>
              {notice && notice.type === 'error' && <Alert title="Lỗi" variant="error">{notice.text}</Alert>}

              {/* Master toggle */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border border-fb-border bg-fb-surface-muted">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fb-text-primary text-sm">Áp dụng phạm vi Sai lệch dữ liệu (Master Toggle)</span>
                    <Badge variant={config.enabled ? 'success' : 'neutral'}>
                      {config.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-fb-text-secondary mt-1">
                    {config.enabled
                      ? 'Đang bật: Các rule có Rule toggle = Enabled sẽ chỉ đánh giá trên các Epic thoả mãn điều kiện ngày được cấu hình.'
                      : 'Đang tắt: Toàn bộ các rule Sai lệch dữ liệu áp dụng trên toàn bộ các Epic theo lớp dữ liệu L03 như hiện nay.'}
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-fb-border p-0.5 bg-fb-surface">
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, enabled: true }))}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      config.enabled
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-fb-text-secondary hover:text-fb-text-primary'
                    }`}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, enabled: false }))}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                      !config.enabled
                        ? 'bg-slate-600 text-white shadow-sm'
                        : 'text-fb-text-secondary hover:text-fb-text-primary'
                    }`}
                  >
                    Disabled
                  </button>
                </div>
              </div>

              {/* Matrix Table */}
              <TableContainer className="overflow-x-auto">
                <Table className="min-w-[980px] w-full">
                  <THead>
                    <TR>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary min-w-[260px]">
                        Rule Sai lệch dữ liệu
                      </TH>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary min-w-[170px]">
                        Ngày tạo Epic &gt;
                      </TH>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary min-w-[170px]">
                        Ngày Start Date &gt;
                      </TH>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary min-w-[170px]">
                        Ngày R4G Date &gt;
                      </TH>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary min-w-[170px]">
                        Ngày Due Date &gt;
                      </TH>
                      <TH className="py-2.5 px-3 text-xs font-bold text-fb-text-secondary text-center min-w-[140px]">
                        Rule toggle
                      </TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ANOMALY_RULES.map((rule) => {
                      const rConfig = config.rules[rule.id] ?? {
                        enabled: false,
                        createdAfter: null,
                        startAfter: null,
                        r4gAfter: null,
                        dueAfter: null,
                      };
                      return (
                        <TR key={rule.id}>
                          <TD className="py-3 px-3 align-middle">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <Badge variant="neutral" className="text-[10px] font-mono px-1.5 py-0.5">
                                  {rule.code}
                                </Badge>
                                <span className="text-xs font-semibold text-fb-text-primary">
                                  {rule.label}
                                </span>
                              </div>
                              <span className="text-[11px] text-fb-text-secondary mt-0.5 leading-tight">
                                {rule.meaning}
                              </span>
                            </div>
                          </TD>

                          {/* 4 Date columns with reset button */}
                          {(
                            [
                              { key: 'createdAfter', label: 'Ngày tạo Epic' },
                              { key: 'startAfter', label: 'Start Date' },
                              { key: 'r4gAfter', label: 'R4G Date' },
                              { key: 'dueAfter', label: 'Due Date' },
                            ] as const
                          ).map(({ key }) => {
                            const val = rConfig[key] ?? '';
                            return (
                              <TD key={key} className="py-3 px-3 align-middle">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="date"
                                    className="h-8 px-2 text-xs rounded border border-fb-border bg-fb-surface text-fb-text-primary focus:outline-none focus:ring-1 focus:ring-emerald-500 w-[125px] disabled:opacity-50"
                                    value={val}
                                    disabled={!config.enabled}
                                    onChange={(e) => updateRuleField(rule.id, key, e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="p-1.5 text-fb-text-secondary hover:text-fb-text-primary rounded border border-fb-border hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    title="Xóa thông tin cấu hình"
                                    disabled={!config.enabled || !val}
                                    onClick={() => updateRuleField(rule.id, key, '')}
                                  >
                                    <ArrowCounterClockwise className="size-3.5" weight="bold" />
                                  </button>
                                </div>
                              </TD>
                            );
                          })}

                          {/* Rule toggle column */}
                          <TD className="py-3 px-3 align-middle text-center">
                            <div className="inline-flex rounded-md border border-fb-border p-0.5 bg-fb-surface">
                              <button
                                type="button"
                                disabled={!config.enabled}
                                onClick={() => updateRuleEnabled(rule.id, true)}
                                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                  rConfig.enabled
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-fb-text-secondary hover:text-fb-text-primary disabled:opacity-40'
                                }`}
                              >
                                Enabled
                              </button>
                              <button
                                type="button"
                                disabled={!config.enabled}
                                onClick={() => updateRuleEnabled(rule.id, false)}
                                className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                                  !rConfig.enabled
                                    ? 'bg-slate-600 text-white shadow-sm'
                                    : 'text-fb-text-secondary hover:text-fb-text-primary disabled:opacity-40'
                                }`}
                              >
                                Disabled
                              </button>
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableContainer>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <p className="text-xs text-fb-text-secondary">
                  Cập nhật lần cuối: {meta.updatedAt ? `${new Date(meta.updatedAt).toLocaleString('vi-VN')}${meta.updatedByName ? ` bởi ${meta.updatedByName}` : ''}` : 'Chưa có thông tin'}.
                </p>
                <Button isLoading={saving} onClick={save}>Lưu &amp; tính toán lại cache</Button>
              </div>
            </>
          )}
        </CardBody>
      )}
    </Card>
  );
}
