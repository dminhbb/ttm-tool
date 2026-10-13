import { NextRequest, NextResponse } from 'next/server';
import { parseNormalizationPages, parseNormalizationPanelCodes } from '@/lib/data-normalization';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getDataNormalization } from '@/modules/ttm/public';

/** A list filter, one value per repeated key (`?projects=A&projects=B`) — never comma-joined: the
 * names of a "Đơn vị yêu cầu" or a component may contain commas themselves. */
function listParam(params: URLSearchParams, key: string): string[] {
  return params.getAll(key).map((value) => value.trim()).filter(Boolean);
}

/**
 * "Chuẩn hoá dữ liệu": per rule of the screen, the Epics breaking it — scoped to the caller and
 * filtered by the same toolbar filters as TTM Dashboard 2 (domain, projects, components, pmSms,
 * requestingUnits; the list ones as repeated params). `open=R1,R5` names the panels to return Epic
 * rows for (the others only get their count), `pages=R1:2,R5:3` the page of each (25 Epics per page),
 * `options=1` asks for the toolbar's filter options (first load only).
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
      includeFilterOptions: params.get('options') === '1',
      openPanels: parseNormalizationPanelCodes(params.get('open')),
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
