import { CheckCircle } from '@phosphor-icons/react';

/** Right-aligned legend for the phase cells of Quản trị Epic (see .ttm-phase-cell.pass/.fail and
 * .ttm-phase-current-dot): green = phase done (CheckCircle replaces the baseline arrow), pink = not done
 * and past its baseline ("Trễ pha"), dot = the phase the Epic is in. Rules: scoring/story-phase.ts. */
export function StatusColorLegend() {
  return (
    <div className="ttm-status-legend" aria-label="Chú giải ô pha">
      <span className="ttm-status-legend-item" title="DEV / TEST: ≥ 80% story đã qua pha (hoặc Epic ≥ 3 story còn tối đa 1 story chưa xong); bỏ qua story Cancelled / Pending. PENTEST: mọi subtask Pentest Done, không có thì xong cùng TEST. Rê chuột vào ô pha để xem chi tiết.">
        <span className="ttm-status-swatch done" aria-hidden="true" />
        <CheckCircle className="size-3 shrink-0" weight="bold" aria-hidden="true" />
        Hoàn thành pha
      </span>
      <span className="ttm-status-legend-item" title="Pha chưa hoàn thành mà đã quá ngày baseline của pha.">
        <span className="ttm-status-swatch failed" aria-hidden="true" />Trễ pha
      </span>
      <span className="ttm-status-legend-item" title="Pha đầu tiên chưa hoàn thành của Epic (DESIGN nếu status Epic = Design; R4GOLIVE nếu status từ R4GOLIVE trở đi). Không có khi Epic đã Released hoặc mọi pha đã xong.">
        <span className="ttm-status-swatch-dot" aria-hidden="true" />Pha hiện tại
      </span>
    </div>
  );
}
