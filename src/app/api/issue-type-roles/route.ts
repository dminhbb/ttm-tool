import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import {
  createIssueTypeRoleMapping,
  deleteIssueTypeRoleMapping,
  listIssueTypeRoleMappings,
  updateIssueTypeRoleMapping,
} from '@/lib/master-data-service';
import { TEAM_ROLES } from '@/lib/master-data-types';
import type { IssueTypeRoleMappingInput, TeamRole } from '@/lib/master-data-types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý Issue Type.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function validate(body: unknown): { error: string } | { value: IssueTypeRoleMappingInput } {
  if (!isRecord(body)) return { error: 'Dữ liệu không hợp lệ' };
  const issueType = typeof body.issueType === 'string' ? body.issueType.trim() : '';
  const teamRole = body.teamRole as TeamRole;
  if (!issueType) return { error: 'Issue Type là bắt buộc' };
  if (!TEAM_ROLES.includes(teamRole)) return { error: 'Role không hợp lệ' };
  return { value: { issueType, teamRole } };
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    return NextResponse.json(await listIssueTypeRoleMappings());
  } catch (error: unknown) {
    console.error('API Error in issue-type-roles route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Issue Type';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const parsed = validate(await request.json());
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const mapping = await createIssueTypeRoleMapping(parsed.value);
    return NextResponse.json(mapping, { status: 201 });
  } catch (error: unknown) {
    if (isRecord(error) && error.code === '23505') {
      return NextResponse.json({ error: 'Issue Type này đã được khai báo' }, { status: 409 });
    }
    console.error('API Error creating issue-type-role mapping:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Issue Type';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = await request.json();
    const id = isRecord(body) ? Number(body.id) : NaN;
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    const parsed = validate(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const mapping = await updateIssueTypeRoleMapping(id, parsed.value);
    return NextResponse.json(mapping);
  } catch (error: unknown) {
    if (isRecord(error) && error.code === '23505') {
      return NextResponse.json({ error: 'Issue Type này đã được khai báo' }, { status: 409 });
    }
    console.error('API Error updating issue-type-role mapping:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Issue Type';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const url = new URL(request.url);
    const idStr = url.searchParams.get('id');
    const id = idStr ? parseInt(idStr) : NaN;
    if (Number.isNaN(id)) return NextResponse.json({ error: 'ID không hợp lệ' }, { status: 400 });
    await deleteIssueTypeRoleMapping(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting issue-type-role mapping:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Issue Type';
    return authError(error) ?? NextResponse.json({ error: message }, { status: 500 });
  }
}
