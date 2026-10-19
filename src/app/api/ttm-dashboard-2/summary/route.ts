import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import { getTtmDashboard2FilteredSummary, parseTtmDashboard2View } from '@/modules/ttm/public';
import type { TtmDashboard2Filters } from '@/lib/ttm-funnel-summary';

/**
 * TTM Dashboard 2 numbers for one toolbar filter, summarized on the server (2026-10-19). The page uses
 * it in the Lead view, where the company-wide Epic rows are not sent to the browser (see ./rows). List
 * filters are repeated parameters (`projects=A&projects=B`) since names may contain commas.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const params = request.nextUrl.searchParams;
    const values = (name: string) => params.getAll(name).map((value) => value.trim()).filter(Boolean);
    const filters: TtmDashboard2Filters = {
      components: values('components'),
      domain: (params.get('domain') ?? '').trim(),
      pmSms: values('pmSms'),
      projects: values('projects'),
      requestingUnits: values('requestingUnits'),
    };
    return NextResponse.json(await getTtmDashboard2FilteredSummary(actor, params.get('viewAsUserId'), parseTtmDashboard2View(params.get('view')), filters));
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 },
      );
    }
    console.error('TTM Dashboard 2 summary API error:', error);
    return NextResponse.json({ error: 'Không thể tính số liệu theo bộ lọc.' }, { status: 500 });
  }
}
