import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/modules/iam/public';
import {
  generateEpicReport,
  getReportAccessScope,
  getReportLayers,
  listLegacyReportFilterReferences,
  reportAllowedComponents,
  reportScopeAllowsProject,
  scopeReportFilterOptions,
} from '@/modules/ttm/public';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser(request);

    const [scope, references, layers] = await Promise.all([
      getReportAccessScope(user),
      listLegacyReportFilterReferences(),
      getReportLayers(),
    ]);
    const { components, domains, projects } = scopeReportFilterOptions(
      scope,
      references.domains,
      references.projects,
      references.components,
    );

    return NextResponse.json({
      components,
      domains,
      layerDateSources: layers.sources,
      layerDates: layers.dates,
      projects,
      success: true,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem Báo cáo.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 }
      );
    }
    const message = error instanceof Error ? error.message : 'Không thể tải thông tin bộ lọc báo cáo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireUser(request);

    const body = await request.json().catch(() => ({}));
    const { domainId, projectKey, component, stateDate, compareStateDate, createdDateFrom, startDateFrom, releasedDateFrom, releasedDateTo, asOfDate, compareAsOfDate } = body;

    if (!projectKey) {
      return NextResponse.json({ error: 'Thông tin Dự án (projectKey) là bắt buộc.' }, { status: 400 });
    }

    const scope = await getReportAccessScope(user);
    if (typeof projectKey !== 'string' || !reportScopeAllowsProject(scope, projectKey)) {
      return NextResponse.json({ error: 'Bạn không có quyền xem báo cáo của dự án này.' }, { status: 403 });
    }
    const allowedComponents = reportAllowedComponents(scope, projectKey);
    if (allowedComponents && component && component !== 'ALL'
      && !allowedComponents.some((name) => name.toLowerCase() === String(component).toLowerCase())) {
      return NextResponse.json({ error: 'Bạn không có quyền xem báo cáo của component này.' }, { status: 403 });
    }

    if (typeof stateDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(stateDate)) {
      return NextResponse.json({ error: 'Bạn phải chọn 1 Lớp dữ liệu.' }, { status: 400 });
    }

    const reportPromise = generateEpicReport({
      allowedComponents,
      asOfDate,
      component,
      createdDateFrom,
      domainId: domainId ? Number(domainId) : undefined,
      projectKey,
      releasedDateFrom: releasedDateFrom || releasedDateTo,
      startDateFrom,
      stateDate,
    });

    let compareReportPromise = Promise.resolve<Awaited<ReturnType<typeof generateEpicReport>> | null>(null);
    if (typeof compareStateDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(compareStateDate)) {
      compareReportPromise = generateEpicReport({
        allowedComponents,
        asOfDate: compareAsOfDate,
        component,
        createdDateFrom,
        domainId: domainId ? Number(domainId) : undefined,
        projectKey,
        releasedDateFrom: releasedDateFrom || releasedDateTo,
        startDateFrom,
        stateDate: compareStateDate,
      });
    }

    const [report, compareReport] = await Promise.all([reportPromise, compareReportPromise]);

    return NextResponse.json({
      compareReport,
      report,
      success: true,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền tạo Báo cáo.' : 'Chưa đăng nhập.' },
        { status: error.code === 'FORBIDDEN' ? 403 : 401 }
      );
    }
    const message = error instanceof Error ? error.message : 'Lỗi khi tạo báo cáo.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
