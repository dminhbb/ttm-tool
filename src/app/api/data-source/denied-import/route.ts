import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody, requireEpicKeys } from '@/lib/data-source-api-helpers';
import {
  addDeniedImportEpics,
  getImportAdmissionSettings,
  listDeniedImportEpics,
  removeDeniedImportEpics,
  setDeniedImportAllowance,
} from '@/lib/denied-import-service';

/**
 * "Từ chối import" list. GET: the list + the A/B parameters. POST { epicKeys, reason }: deny (and
 * delete their data). PATCH { epicKeys, allowImport }: edit "Cho phép import" (false deletes the data
 * again). DELETE { epicKeys }: take them off the list.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const [epics, settings] = await Promise.all([listDeniedImportEpics(), getImportAdmissionSettings()]);
    return NextResponse.json({ epics, settings });
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi tải danh sách Từ chối import');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 1000) : null;
    return NextResponse.json(await addDeniedImportEpics(requireEpicKeys(body.epicKeys), reason, user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi thêm Epic vào Từ chối import');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    if (typeof body.allowImport !== 'boolean') return NextResponse.json({ error: 'Thiếu giá trị "Cho phép import".' }, { status: 400 });
    const deletion = await setDeniedImportAllowance(requireEpicKeys(body.epicKeys), body.allowImport, user.id);
    return NextResponse.json({ deletion });
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi cập nhật "Cho phép import"');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    return NextResponse.json({ removed: await removeDeniedImportEpics(requireEpicKeys(body.epicKeys)) });
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi xóa Epic khỏi Từ chối import');
  }
}
