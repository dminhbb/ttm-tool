import { cn } from '@/lib/utils';

/**
 * The black dot marking an "Epic ngoại lệ" (ttm_black_listed = true in black_listed_epics) next to
 * its Epic key — the Epic is outside every Time to Market calculation. One component so every Epic
 * list (Quản trị Epic, Epic in PO, Báo cáo Epic, Duyệt Epic) shows the very same marker.
 */
export function TtmBlackListDot({ className }: { className?: string }) {
  const label = 'Epic ngoại lệ (TTM Black listed) — đã loại khỏi phạm vi tính toán Time to Market';
  return (
    <span
      aria-label={label}
      className={cn('inline-block size-2 shrink-0 rounded-full align-middle', className)}
      role="img"
      style={{ backgroundColor: '#000000' }}
      title={label}
    />
  );
}
