import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createApiKey, deleteApiKey, listApiKeys, updateApiKey } from '@/lib/api-key-service';
import type { ApiKeyInput } from '@/lib/api-key-types';

const ALLOWED_ROLES = ['SUPERADMIN'] as const;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN mới có quyền quản lý API Key.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 }
    );
  }
  return null;
}

function validateInput(body: ApiKeyInput): string | null {
  if (!body.keyName?.trim()) return 'Tên API key là bắt buộc';
  if (!body.appName?.trim()) return 'Tên ứng dụng là bắt buộc';
  if (!body.apiKey?.trim()) return 'Mã API key là bắt buộc';
  if (body.isUnlimited === false) {
    if (!body.validFrom) return 'Vui lòng chọn Ngày bắt đầu khi không sử dụng tùy chọn "Không giới hạn"';
    if (body.validTo && new Date(body.validTo).getTime() < new Date(body.validFrom).getTime()) {
      return 'Ngày kết thúc phải lớn hơn hoặc bằng Ngày bắt đầu';
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    return NextResponse.json(await listApiKeys());
  } catch (error: unknown) {
    console.error('API Error listing api-keys:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách API Key';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as ApiKeyInput;
    const validationError = validateInput(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const apiKeyObj = await createApiKey(body);
    return NextResponse.json(apiKeyObj, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating api-key:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'Mã API Key đã tồn tại trên hệ thống.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo API Key';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const body = (await request.json()) as ApiKeyInput & { id: number };
    if (!body.id) return NextResponse.json({ error: 'API Key ID là bắt buộc' }, { status: 400 });
    const validationError = validateInput(body);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const apiKeyObj = await updateApiKey(body.id, body);
    if (!apiKeyObj) return NextResponse.json({ error: 'Không tìm thấy API Key' }, { status: 404 });
    return NextResponse.json(apiKeyObj);
  } catch (error: unknown) {
    console.error('API Error updating api-key:', error);
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'Mã API Key đã trùng với 1 bản ghi khác.' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật API Key';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, [...ALLOWED_ROLES]);
    const idStr = new URL(request.url).searchParams.get('id');
    const id = idStr ? parseInt(idStr, 10) : NaN;
    if (Number.isNaN(id)) return NextResponse.json({ error: 'API Key ID không hợp lệ' }, { status: 400 });
    const success = await deleteApiKey(id);
    if (!success) return NextResponse.json({ error: 'Không tìm thấy API Key' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting api-key:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa API Key';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
