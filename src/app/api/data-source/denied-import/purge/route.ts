import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody, requireEpicKeys } from '@/lib/data-source-api-helpers';
import { deleteRemainingDeniedData } from '@/lib/denied-import-service';

/**
 * POST { epicKeys } — "Xóa dữ liệu còn tồn tại": runs the Epic deletion on listed (denied) Epics the
 * database still holds data of, e.g. the SEED list after the migration on another database.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    return NextResponse.json(await deleteRemainingDeniedData(requireEpicKeys(body.epicKeys), user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi xóa dữ liệu Epic bị từ chối');
  }
}
