'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { TtmBlackListDot } from '@/components/ui/TtmBlackListDot';

interface ApiErrorResponse {
  error?: string;
}

/**
 * Nút toggle "Epic ngoại lệ" (TTM Black listed), dùng chung bởi popup "Duyệt Epic" (EpicBrowserModal) và
 * "Thông tin Epic" / Review Notes (EpicMarkModal). Hiển thị hover tooltip diễn giải ý nghĩa theo trạng thái.
 * ADMIN / SUPERADMIN mới được đổi (canEdit).
 */
export function TtmBlackListToggle({
  canEdit,
  epicKey,
  initialValue,
  onValueChange,
}: {
  canEdit: boolean;
  epicKey: string;
  initialValue: boolean;
  onValueChange?: (nextValue: boolean) => void;
}) {
  const [value, setValue] = React.useState(initialValue);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Re-sync the local value when the parent's value changes (adjusting state during render instead
  // of in an effect, so there's no extra cascading render).
  const [syncedInitialValue, setSyncedInitialValue] = React.useState(initialValue);
  if (syncedInitialValue !== initialValue) {
    setSyncedInitialValue(initialValue);
    setValue(initialValue);
  }

  const handleConfirmedToggle = async () => {
    if (!canEdit || saving) return;
    const nextValue = !value;
    const prevValue = value;
    setValue(nextValue);
    setSaving(true);
    try {
      const response = await fetch('/api/black-listed-epics', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blackListed: nextValue, epicKey }),
      });
      const data = (await response.json()) as ApiErrorResponse;
      if (!response.ok) throw new Error(data.error ?? 'Không thể lưu TTM Black listed.');

      if (nextValue) {
        showToast(
          `Cảnh báo: Epic ${epicKey} đã được chuyển sang Epic ngoại lệ (TTM Black listed = true) — bị loại khỏi phạm vi tính toán Time to Market!`,
          7000
        );
      } else {
        showToast(
          `Đã bỏ ngoại lệ cho Epic ${epicKey} (TTM Black listed = false). Epic được đưa trở lại tính toán Time to Market.`,
          7000
        );
      }
      onValueChange?.(nextValue);
    } catch (requestError: unknown) {
      setValue(prevValue);
      showToast(
        requestError instanceof Error ? requestError.message : 'Không thể kết nối API.',
        5000
      );
    } finally {
      setSaving(false);
    }
  };

  const tooltipText = value
    ? 'Epic này đang là Epic ngoại lệ — không nằm trong phạm vi tính toán Time to Market.'
    : 'Epic này đang được tính Time to Market như bình thường.';

  const confirmDescription = value
    ? 'Epic sẽ được đưa trở lại các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?'
    : 'Đánh dấu Epic này ngoại lệ sẽ loại bỏ khỏi tất cả các tính toán và cảnh báo Time to Market, bạn có đồng ý không ?';

  const confirmTitle = value ? 'Xác nhận đưa Epic trở lại TTM' : 'Xác nhận chuyển sang Epic ngoại lệ';

  return (
    <>
      <Tooltip content={tooltipText} side="bottom" className="inline-flex w-auto">
        <button
          type="button"
          onClick={() => {
            if (!canEdit || saving) return;
            setConfirmOpen(true);
          }}
          disabled={!canEdit || saving}
          className={cn(
            'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs cursor-pointer',
            value
              ? 'bg-status-danger-soft text-status-danger border-status-danger hover:brightness-95'
              : 'bg-fb-surface-muted text-fb-text-secondary border-fb-border hover:bg-fb-control-hover',
            (!canEdit || saving) && 'opacity-60 cursor-not-allowed'
          )}
        >
          <TtmBlackListDot />
          <span>Epic ngoại lệ</span>
          <span
            className={cn(
              'ml-1 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
              value ? 'bg-status-danger text-white' : 'bg-fb-control-hover text-fb-text-secondary'
            )}
          >
            {value ? 'True' : 'False'}
          </span>
        </button>
      </Tooltip>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleConfirmedToggle();
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="Đồng ý"
        cancelLabel="Hủy"
      />
    </>
  );
}
