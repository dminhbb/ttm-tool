import { NextRequest, NextResponse } from 'next/server';
import { parseNormalizationPages } from '@/lib/data-normalization';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getDataNormalization } from '@/modules/ttm/public';

/** `a,b,c` → ['a', 'b', 'c'] (empty / missing → []). */
function listParam(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? '').split(',').map((value) => value.trim()).filter(Boolean);
}

/**
 * "Chuẩn hoá dữ liệu": per "Sai lệch dữ liệu" rule, the Epics breaking it — scoped to the caller and
 * filtered by the same toolbar filters as TTM Dashboard 2 (domain, projects, components, pmSms,
 * requestingUnits). `pages=R1:2,R5:3` picks the page of each rule's panel (25 Epics per page).
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const params = request.nextUrl.searchParams;
    const data = await getDataNormalization(actor, {
      filters: {
        components: listParam(params, 'components'),
        domain: params.get('domain')?.trim() ?? '',
        pmSms: listParam(params, 'pmSms'),
        projects: listParam(params, 'projects'),
        requestingUnits: listParam(params, 'requestingUnits'),
      },
      pages: parseNormalizationPages(params.get('pages')),
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    console.error('Data normalization API error:', error);
    return NextResponse.json({ error: 'Không thể tải dữ liệu chuẩn hoá.' }, { status: 500 });
  }
}
