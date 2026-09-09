import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listDomains, listProjectComponents, listProjects } from '@/lib/master-data-service';
import { generateEpicReport, getReportLayerDates } from '@/lib/reports-service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser(request);

    const [domains, projects, components, layerDates] = await Promise.all([
      listDomains(),
      listProjects(),
      listProjectComponents(),
      getReportLayerDates(),
    ]);

    return NextResponse.json({
      components,
      domains,
      layerDates,
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
    return NextResponse.json({ error: (error as any)?.message || 'Không thể tải thông tin bộ lọc báo cáo.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser(request);

    const body = await request.json().catch(() => ({}));
    const { domainId, projectKey, component, selectedLayerDates, createdDateFrom, startDateFrom, releasedDateFrom, releasedDateTo } = body;

    if (!projectKey) {
      return NextResponse.json({ error: 'Thông tin Dự án (projectKey) là bắt buộc.' }, { status: 400 });
    }

    if (!selectedLayerDates || !Array.isArray(selectedLayerDates) || selectedLayerDates.length === 0) {
      return NextResponse.json({ error: 'Bạn phải chọn ít nhất 1 Lớp dữ liệu.' }, { status: 400 });
    }

    const report = await generateEpicReport({
      component,
      createdDateFrom,
      domainId: domainId ? Number(domainId) : undefined,
      projectKey,
      releasedDateFrom: releasedDateFrom || releasedDateTo,
      selectedLayerDates,
      startDateFrom,
    });

    return NextResponse.json({
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
    return NextResponse.json({ error: (error as any)?.message || 'Lỗi khi tạo báo cáo.' }, { status: 500 });
  }
}
