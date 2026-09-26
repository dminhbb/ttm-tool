import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import pool from '@/lib/db';
import { refreshDerivedCaches } from '@/lib/daily-cache-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được tổng hợp lại dữ liệu.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

/**
 * Manually re-runs the two eager, per-import caches (see refreshTtmIndexGlobalCache /
 * refreshEpicAlertRowCache — both normally only triggered right after a CSV import commits, see
 * import-service.ts) without requiring a new import. Useful after a direct DB fix, a restore from
 * backup, or recovering from a cache-refresh failure that was silently logged during import (both
 * refresh functions never throw on their own, by design — see their doc comments). Reused by every
 * role's TTM-Index(PM)/QA-Index(PM)/Quản trị Epic screens in one pass, since epic_alert_row_cache is
 * computed once, unscoped, and filtered per role only at read time — no per-role recompute needed.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    await requireUser(request, ['SUPERADMIN']);

    const latestBatch = await pool.query<{ id: number }>('SELECT id FROM import_batches ORDER BY aggregated_at DESC, id DESC LIMIT 1;');
    const latestBatchId = latestBatch.rows[0]?.id ?? null;

    // One unscoped recompute feeding both caches (see refreshDerivedCaches), not one per cache.
    await refreshDerivedCaches(latestBatchId);

    const rowCacheCount = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM epic_alert_row_cache;');

    return NextResponse.json({
      success: true,
      durationMs: Date.now() - startedAt,
      sourceImportBatchId: latestBatchId,
      epicAlertRowCacheCount: Number(rowCacheCount.rows[0]?.n ?? 0),
    });
  } catch (error: unknown) {
    console.error('API Error in admin/data-source/recompute-cache route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tổng hợp lại dữ liệu.';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
