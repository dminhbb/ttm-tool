import { after, NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getTtmScopeConfigWithMeta, saveTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import { getLatestImportBatchId, refreshDerivedCachesInBackground } from '@/lib/daily-cache-service';

// The cache rebuild runs in after() — past the response — since it re-derives every Epic's row from
// scratch (same cost as a post-import refresh, see daily-cache-service.ts's own maxDuration).
export const maxDuration = 300;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Phạm vi dữ liệu cho TTM.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

function isValidDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

// Any authenticated role, not just SUPERADMIN/SUPERVISOR — Dashboard 2's Advanced Filters (every
// role) pre-fills A/B/C/D from this default, so read access can't be admin-only like PUT is.
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json(await getTtmScopeConfigWithMeta());
  } catch (error: unknown) {
    console.error('API Error in ttm-scope-config GET:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải Phạm vi dữ liệu cho TTM.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const { cnttFrom, cnttTo, qaFrom, qaTo } = body as Record<string, unknown>;
    if (![cnttFrom, cnttTo, qaFrom, qaTo].every(isValidDateOrNull)) {
      return NextResponse.json({ error: 'Ngày không hợp lệ — dùng định dạng YYYY-MM-DD hoặc để trống.' }, { status: 400 });
    }
    if (typeof cnttFrom === 'string' && typeof cnttTo === 'string' && cnttFrom > cnttTo) {
      return NextResponse.json({ error: 'R4G for TTM (CNTT): giá trị "từ" phải trước hoặc bằng giá trị "đến".' }, { status: 400 });
    }
    if (typeof qaFrom === 'string' && typeof qaTo === 'string' && qaFrom > qaTo) {
      return NextResponse.json({ error: 'R4G for TTM (QA): giá trị "từ" phải trước hoặc bằng giá trị "đến".' }, { status: 400 });
    }

    await saveTtmScopeConfig(
      { cnttFrom: cnttFrom as string | null, cnttTo: cnttTo as string | null, qaFrom: qaFrom as string | null, qaTo: qaTo as string | null },
      user.id,
    );

    // Recompute + cache immediately — same refreshDerivedCaches() a CSV import triggers (see
    // daily-cache-service.ts) — so TTM-Index (QLDA)/QA-Index (QLDA) and every Epic's "Nhận xét" badge
    // reflect the new scope right away instead of waiting for the next import/daily run.
    const batchId = await getLatestImportBatchId();
    after(() => refreshDerivedCachesInBackground(batchId, 'ttm-scope-config'));

    return NextResponse.json({ ...(await getTtmScopeConfigWithMeta()), refreshing: true });
  } catch (error: unknown) {
    console.error('API Error in ttm-scope-config PUT:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể lưu Phạm vi dữ liệu cho TTM.' }, { status: 500 });
  }
}
