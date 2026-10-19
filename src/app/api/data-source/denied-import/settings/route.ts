import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody } from '@/lib/data-source-api-helpers';
import { saveImportAdmissionSettings } from '@/lib/denied-import-service';
import { vietnamIsoDate } from '@/lib/import-admission-rules';

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
    // A date in the future would deny (and later purge) Epics that are perfectly in scope — e.g. B set
    // to the end of the year catches every Released Epic. Refused outright (2026-10-19).
    const today = vietnamIsoDate(new Date())!;
    const future = [createdBefore && createdBefore > today ? 'A (Ngày Created >=)' : null, releasedDueBefore && releasedDueBefore > today ? 'B (Ngày Due Date >=)' : null].filter(Boolean);
    if (future.length > 0) {
      return NextResponse.json({ error: `Ngày ${future.join(' và ')} không được sau hôm nay (${today.split('-').reverse().join('/')}) — rule sẽ từ chối cả các Epic đang trong phạm vi.` }, { status: 400 });
    }
    return NextResponse.json(await saveImportAdmissionSettings({ createdBefore, releasedDueBefore }, user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi lưu cấu hình Từ chối import');
  }
}
