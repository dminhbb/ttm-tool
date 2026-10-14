import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody, requireEpicKeys } from '@/lib/data-source-api-helpers';
import { executeEpicDeletion, previewEpicDeletion } from '@/lib/epic-deletion-service';

/**
 * Epic deletion — GET ?keys=A-1,B-2 lists the issue keys (Epic, Stories, Subtasks) and the rows per
 * table it would remove; POST { epicKeys } removes them. Caches are not rebuilt (run them by hand).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const keys = requireEpicKeys(new URL(request.url).searchParams.get('keys'));
    return NextResponse.json(await previewEpicDeletion(keys));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi xem trước Epic deletion');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    return NextResponse.json(await executeEpicDeletion(requireEpicKeys(body.epicKeys), user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi xóa Epic');
  }
}
