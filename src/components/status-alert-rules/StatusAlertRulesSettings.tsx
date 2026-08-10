'use client';

import { useEffect, useState } from 'react';
import { PencilSimple, Plus } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { TableAction } from '@/components/ui/TableAction';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EPIC_COMPLEXITY_TYPES } from '@/lib/status-alert-rule-types';
import type { StatusAlertRule, StatusAlertRuleInput } from '@/lib/status-alert-rule-types';

interface Notice {
  text: string;
  type: 'error' | 'success';
}

const EMPTY_RULE: StatusAlertRuleInput = {
  earlyAlertOffsetDays: 0,
  epicComplexityType: 'SIMPLE',
  epicStatus: 'Design',
  failOffsetDays: 0,
  isActive: true,
  lateAlertOffsetDays: 0,
};

function getComplexityLabel(value: StatusAlertRule['epicComplexityType']): string {
  return value === 'SIMPLE' ? 'Epic đơn giản' : 'Epic phức tạp';
}

function offsetLabel(value: number): string {
  return `T1 + ${value} ngày làm việc`;
}

function toFormRule(rule: StatusAlertRule): StatusAlertRuleInput {
  return {
    earlyAlertOffsetDays: rule.earlyAlertOffsetDays,
    epicComplexityType: rule.epicComplexityType,
    epicStatus: rule.epicStatus,
    failOffsetDays: rule.failOffsetDays,
    isActive: rule.isActive,
    lateAlertOffsetDays: rule.lateAlertOffsetDays,
  };
}

export function StatusAlertRulesSettings() {
  const [rules, setRules] = useState<StatusAlertRule[]>([]);
  const [form, setForm] = useState<StatusAlertRuleInput>(EMPTY_RULE);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadRules = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/status-alert-rules');
      const payload: unknown = await response.json();
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error('Không thể tải cấu hình cảnh báo.');
      }
      setRules(payload as StatusAlertRule[]);
    } catch (error: unknown) {
      setNotice({ text: error instanceof Error ? error.message : 'Không thể tải cấu hình cảnh báo.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadRules);
  }, []);

  const openEdit = (rule: StatusAlertRule): void => {
    setNotice(null);
    setEditingId(rule.id);
    setForm(toFormRule(rule));
    setIsModalOpen(true);
  };

  const openCreate = (): void => {
    setNotice(null);
    setEditingId(null);
    setForm({ ...EMPTY_RULE });
    setIsModalOpen(true);
  };

  const updateOffset = (field: keyof Pick<StatusAlertRuleInput, 'earlyAlertOffsetDays' | 'lateAlertOffsetDays' | 'failOffsetDays'>, value: string): void => {
    const parsed = Number(value);
    setForm((current) => ({ ...current, [field]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const saveRule = async (): Promise<void> => {
    setIsSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/status-alert-rules', {
        body: JSON.stringify(editingId === null ? form : { ...form, id: editingId }),
        headers: { 'Content-Type': 'application/json' },
        method: editingId === null ? 'POST' : 'PUT',
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const errorMessage = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Không thể lưu cấu hình cảnh báo.';
        setNotice({ text: errorMessage, type: 'error' });
        return;
      }
      const savedRule = payload as StatusAlertRule;
      setRules((current) => editingId === null
        ? [...current, savedRule].sort((first, second) => first.epicComplexityType.localeCompare(second.epicComplexityType) || first.epicStatus.localeCompare(second.epicStatus))
        : current.map((rule) => rule.id === savedRule.id ? savedRule : rule));
      setIsModalOpen(false);
      setNotice({ text: editingId === null ? 'Đã thêm rule cảnh báo mới.' : 'Đã lưu cấu hình cảnh báo. Lần tải Theo dõi Epic kế tiếp sẽ dùng mốc mới.', type: 'success' });
    } catch {
      setNotice({ text: 'Không thể kết nối API để lưu cấu hình cảnh báo.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <Alert title={notice.type === 'success' ? 'Thành công' : 'Lỗi'} variant={notice.type === 'success' ? 'success' : 'error'}>
          {notice.text}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Quy tắc cảnh báo Epic</CardTitle>
            <p className="mt-1 text-fb-text-secondary">Mốc được tính theo ngày làm việc sau T1 (Start Date).</p>
          </div>
          <Button icon={<Plus className="size-4" weight="bold" />} onClick={openCreate} size="sm">Thêm rule</Button>
        </CardHeader>
        <CardBody>
          {isLoading ? <TableSkeleton rows={4} /> : rules.length === 0 ? (
            <EmptyState description="Không tìm thấy cấu hình cảnh báo." title="Chưa có rule cảnh báo" />
          ) : (
            <TableContainer>
              <Table className="min-w-[920px]">
                <THead>
                  <TR>
                    <TH>Loại Epic</TH>
                    <TH>Trạng thái Epic</TH>
                    <TH>Cảnh báo sớm</TH>
                    <TH>Cảnh báo muộn</TH>
                    <TH>Fail TTM-CNTT</TH>
                    <TH className="text-center">Trạng thái</TH>
                    <TH className="text-center">Hành động</TH>
                  </TR>
                </THead>
                <TBody>
                  {rules.map((rule) => (
                    <TR key={rule.id}>
                      <TD className="font-medium text-fb-text-primary">{getComplexityLabel(rule.epicComplexityType)}</TD>
                      <TD>{rule.epicStatus}</TD>
                      <TD>{offsetLabel(rule.earlyAlertOffsetDays)}</TD>
                      <TD>{offsetLabel(rule.lateAlertOffsetDays)}</TD>
                      <TD>{offsetLabel(rule.failOffsetDays)}</TD>
                      <TD className="text-center">
                        <Badge variant={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'Active' : 'Inactive'}</Badge>
                      </TD>
                      <TD>
                        <div className="flex justify-center">
                          <TableAction icon={<PencilSimple className="size-4" weight="bold" />} onClick={() => openEdit(rule)} variant="info">
                            Chỉnh sửa
                          </TableAction>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={isModalOpen}
        maxWidth="sm"
        onClose={() => setIsModalOpen(false)}
        title={editingId === null ? 'Thêm rule cảnh báo' : 'Chỉnh sửa mốc cảnh báo'}
        footer={<><Button onClick={() => setIsModalOpen(false)} variant="outline">Hủy</Button><Button isLoading={isSaving} onClick={saveRule}>Lưu cấu hình</Button></>}
      >
        <div className="flex flex-col gap-4">
          {editingId === null ? <>
            <Select
              label="Loại Epic"
              onChange={(event) => setForm((current) => ({ ...current, epicComplexityType: event.target.value as StatusAlertRuleInput['epicComplexityType'] }))}
              options={EPIC_COMPLEXITY_TYPES.map((value) => ({ label: getComplexityLabel(value), value }))}
              value={form.epicComplexityType}
            />
            <Input label="Trạng thái Epic" maxLength={50} onChange={(event) => setForm((current) => ({ ...current, epicStatus: event.target.value }))} required value={form.epicStatus} />
          </> : (
            <div className="rounded-md border border-fb-border bg-fb-surface-muted px-3 py-2 text-fb-text-secondary">
              <span className="font-medium text-fb-text-primary">{getComplexityLabel(form.epicComplexityType)}</span>
              <span className="mx-2 text-fb-text-muted">·</span>
              <span>{form.epicStatus}</span>
            </div>
          )}
          <Input label="Offset cảnh báo sớm" min={0} onChange={(event) => updateOffset('earlyAlertOffsetDays', event.target.value)} required type="number" value={form.earlyAlertOffsetDays} />
          <Input label="Offset cảnh báo muộn" min={0} onChange={(event) => updateOffset('lateAlertOffsetDays', event.target.value)} required type="number" value={form.lateAlertOffsetDays} />
          <Input label="Offset Fail TTM-CNTT" min={0} onChange={(event) => updateOffset('failOffsetDays', event.target.value)} required type="number" value={form.failOffsetDays} />
          <label className="ui-check">
            <input checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} type="checkbox" />
            Rule đang hoạt động
          </label>
          <p className="ui-helper">Cảnh báo sớm phải nhỏ hơn cảnh báo muộn, và cảnh báo muộn phải nhỏ hơn mốc Fail.</p>
        </div>
      </Modal>
    </div>
  );
}
