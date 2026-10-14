import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody } from '@/lib/data-source-api-helpers';
import { saveImportAdmissionSettings } from '@/lib/denied-import-service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  return typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined;
}

/** PUT { createdBefore, releasedDueBefore } — the A/B dates of the automatic rules (null = rule off). */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    const createdBefore = readDate(body.createdBefore);
    const releasedDueBefore = readDate(body.releasedDueBefore);
    if (createdBefore === undefined || releasedDueBefore === undefined) {
      return NextResponse.json({ error: 'Ngày cấu hình không hợp lệ (yyyy-mm-dd).' }, { status: 400 });
    }
    return NextResponse.json(await saveImportAdmissionSettings({ createdBefore, releasedDueBefore }, user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi lưu cấu hình Từ chối import');
  }
}
