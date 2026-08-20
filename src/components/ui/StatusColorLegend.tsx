/** Right-aligned color-code legend for the Done/Warning/Failed cell background colors used across
 * the Epic Alerts screens (see .ttm-phase-cell.pass/.warning/.fail and .ttm-stage-pill.done/
 * .early-alert/.late-alert) — shared so the 3 screens can't drift on wording or colors. */
export function StatusColorLegend() {
  return (
    <div className="ttm-status-legend" aria-label="Chú giải mã màu trạng thái">
      <span className="ttm-status-legend-item"><span className="ttm-status-swatch done" aria-hidden="true" />Done</span>
      <span className="ttm-status-legend-item"><span className="ttm-status-swatch warning" aria-hidden="true" />Warning</span>
      <span className="ttm-status-legend-item"><span className="ttm-status-swatch failed" aria-hidden="true" />Failed</span>
    </div>
  );
}
