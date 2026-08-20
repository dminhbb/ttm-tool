/** Fire-and-forget usage counters (see user_usage_daily_stats). Never blocks the click that triggers it. */
function track(kind: 'feature' | 'data'): void {
  void fetch('/api/usage-stats/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).catch(() => undefined);
}

/** Left-panel nav items and avatar submenu items ("Thông tin cá nhân", "Cài đặt", …). */
export function trackFeatureUsage(): void {
  track('feature');
}

/** Epic Alerts screens: alert history, Epic Browser, pagination. */
export function trackDataUsage(): void {
  track('data');
}
