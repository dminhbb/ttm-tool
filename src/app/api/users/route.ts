import { NextRequest, NextResponse } from 'next/server';
import { AuthError, createManagedUser, deleteInactiveManagedUsers, deleteManagedUser, getPmSmCacheFootprint, getUserRolesByIds, listManagedUsers, requireUser, resetUserPassword, updateManagedUser } from '@/lib/auth-service';
import { canGrantRole, canManageUserWithRole, USER_ROLES } from '@/lib/auth-types';
import type { UserInput, UserRole } from '@/lib/auth-types';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';
import { listDomains, listProjects } from '@/lib/master-data-service';
import { validatePassword } from '@/lib/password-rules';

// Every cached Epic row carries its project's PM/SM names, and PM/SM assignment is saved here (a
// user's projects). A save that changes them — the user's project list, or the name of a user who
// is PM/SM (getPmSmCacheFootprint before vs. after) — rebuilds the derived caches in after(), past
// the response, like a project or Domain save does.
export const maxDuration = 300;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isIdList(value: unknown): value is number[] { return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item > 0); }

/** Every key must be one of the granted projectIds (component narrowing only makes sense for a
 * project the user actually has), and every value a de-duplicated list of non-empty component names. */
function parseProjectComponents(value: unknown, projectIds: number[]): Record<string, string[]> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const projectIdStrings = new Set(projectIds.map(String));
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!projectIdStrings.has(key)) return null;
    if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string' && item.trim().length > 0)) return null;
    const components = [...new Set(raw.map((item) => item.trim()))];
    if (components.length > 0) result[key] = components;
  }
  return result;
}

function parseUser(body: unknown, requirePassword: boolean): { error: string } | { value: UserInput } {
  if (!isRecord(body) || typeof body.email !== 'string' || typeof body.fullName !== 'string' || typeof body.role !== 'string' || typeof body.isActive !== 'boolean' || !isIdList(body.domainIds) || (body.isActive && body.domainIds.length === 0) || new Set(body.domainIds).size !== body.domainIds.length || !isIdList(body.projectIds) || new Set(body.projectIds).size !== body.projectIds.length) return { error: 'Dữ liệu người dùng không hợp lệ. User active phải thuộc ít nhất một Domain; Domain và Dự án không được trùng lặp.' };
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@mbbank\.com\.vn$/i.test(email) || body.fullName.trim().length === 0 || body.fullName.trim().length > 255 || !USER_ROLES.includes(body.role as UserRole)) return { error: 'Email MB Bank, họ tên hoặc role không hợp lệ.' };
  if (requirePassword && (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 256)) return { error: 'Mật khẩu phải có từ 8 đến 256 ký tự.' };
  const projectIds = [...new Set(body.projectIds)];
  const projectComponents = parseProjectComponents(body.projectComponents, projectIds);
  if (projectComponents === null) return { error: 'Dữ liệu Components theo Dự án không hợp lệ.' };
  return { value: { email, fullName: body.fullName.trim(), role: body.role as UserRole, isActive: body.isActive, domainIds: body.domainIds, projectIds, projectComponents, ...(typeof body.password === 'string' ? { password: body.password } : {}) } };
}

async function hasActiveDomains(ids: number[]): Promise<boolean> {
  const activeDomainIds = new Set((await listDomains()).filter((domain) => domain.isActive).map((domain) => domain.id));
  return ids.every((id) => activeDomainIds.has(id));
}
async function hasProjects(ids: number[]): Promise<boolean> {
  const projectIds = new Set((await listProjects()).map((project) => project.id));
  return ids.every((id) => projectIds.has(id));
}
function errorResponse(error: unknown): NextResponse | null { if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý user.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 }); return null; }

/** Role-hierarchy guard on EXISTING users: every target id must currently hold a role the actor may
 * manage (canManageUserWithRole). Unknown ids pass — the caller's own 404 handles those. Returns a
 * 403 response to send back, or null when allowed. */
async function forbidUnmanageableTargets(actorRole: UserRole, ids: number[]): Promise<NextResponse | null> {
  const roles = await getUserRolesByIds(ids);
  const blocked = [...roles.values()].some((role) => !canManageUserWithRole(actorRole, role));
  return blocked ? NextResponse.json({ error: 'Bạn không có quyền thao tác trên user có role ngang hoặc cao hơn role của bạn.' }, { status: 403 }) : null;
}

export async function GET(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listManagedUsers()); } catch (error) { return errorResponse(error) ?? NextResponse.json({ error: 'Không thể tải danh sách user.' }, { status: 500 }); } }
export async function POST(request: NextRequest) { try { const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']); const parsed = parseUser(await request.json(), true); if ('error' in parsed) return NextResponse.json(parsed, { status: 400 }); if (!canGrantRole(actor.role, parsed.value.role)) return NextResponse.json({ error: 'Bạn không có quyền gán role này.' }, { status: 403 }); if (!await hasActiveDomains(parsed.value.domainIds)) return NextResponse.json({ error: 'Một hoặc nhiều Domain không tồn tại hoặc đã ngừng hoạt động.' }, { status: 400 }); if (!await hasProjects(parsed.value.projectIds)) return NextResponse.json({ error: 'Một hoặc nhiều Dự án không tồn tại.' }, { status: 400 }); const created = await createManagedUser(parsed.value); if (await getPmSmCacheFootprint([created.id])) scheduleDerivedCacheRefresh('users'); return NextResponse.json(created, { status: 201 }); } catch (error) { if (isRecord(error) && error.code === '23505') return NextResponse.json({ error: 'Email đã tồn tại.' }, { status: 409 }); return errorResponse(error) ?? NextResponse.json({ error: 'Không thể tạo user.' }, { status: 500 }); } }
export async function PUT(request: NextRequest) { try { const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']); const body: unknown = await request.json(); if (!isRecord(body) || !Number.isInteger(body.id) || (body.id as number) <= 0) return NextResponse.json({ error: 'ID user không hợp lệ.' }, { status: 400 }); const parsed = parseUser(body, false); if ('error' in parsed) return NextResponse.json(parsed, { status: 400 }); const forbiddenTarget = await forbidUnmanageableTargets(actor.role, [body.id as number]); if (forbiddenTarget) return forbiddenTarget; if (!canGrantRole(actor.role, parsed.value.role)) return NextResponse.json({ error: 'Bạn không có quyền gán role này.' }, { status: 403 }); if (!await hasActiveDomains(parsed.value.domainIds)) return NextResponse.json({ error: 'Một hoặc nhiều Domain không tồn tại hoặc đã ngừng hoạt động.' }, { status: 400 }); if (!await hasProjects(parsed.value.projectIds)) return NextResponse.json({ error: 'Một hoặc nhiều Dự án không tồn tại.' }, { status: 400 }); const pmSmBefore = await getPmSmCacheFootprint([body.id as number]); const user = await updateManagedUser(body.id as number, parsed.value); if (user && pmSmBefore !== await getPmSmCacheFootprint([user.id])) scheduleDerivedCacheRefresh('users'); return user ? NextResponse.json(user) : NextResponse.json({ error: 'Không tìm thấy user.' }, { status: 404 }); } catch (error) { return errorResponse(error) ?? NextResponse.json({ error: 'Không thể cập nhật user.' }, { status: 500 }); } }
export async function PATCH(request: NextRequest) { try { const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']); const body: unknown = await request.json(); if (!isRecord(body) || !Number.isInteger(body.id) || typeof body.password !== 'string' || !validatePassword(body.password).isValid) return NextResponse.json({ error: 'Mật khẩu mới không đạt quy tắc.' }, { status: 400 }); const forbiddenTarget = await forbidUnmanageableTargets(actor.role, [body.id as number]); if (forbiddenTarget) return forbiddenTarget; const updated = await resetUserPassword(body.id as number, body.password, actor.id); return updated ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Không tìm thấy user.' }, { status: 404 }); } catch (error) { return errorResponse(error) ?? NextResponse.json({ error: 'Không thể cấp lại mật khẩu.' }, { status: 500 }); } }
export async function DELETE(request: NextRequest) { try { const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']); const body: unknown = await request.json().catch(() => null); if (isRecord(body) && Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every((id) => Number.isInteger(id) && id > 0)) { const forbiddenTargets = await forbidUnmanageableTargets(actor.role, body.ids as number[]); if (forbiddenTargets) return forbiddenTargets; const pmSmBefore = await getPmSmCacheFootprint(body.ids as number[]); const deleted = await deleteInactiveManagedUsers(body.ids as number[]); if (pmSmBefore && pmSmBefore !== await getPmSmCacheFootprint(body.ids as number[])) scheduleDerivedCacheRefresh('users'); return NextResponse.json({ success: true, deleted }); } const id = Number(new URL(request.url).searchParams.get('id')); if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'ID user không hợp lệ.' }, { status: 400 }); const forbiddenTarget = await forbidUnmanageableTargets(actor.role, [id]); if (forbiddenTarget) return forbiddenTarget; const pmSmBefore = await getPmSmCacheFootprint([id]); const deleted = await deleteManagedUser(id); if (deleted && pmSmBefore) scheduleDerivedCacheRefresh('users'); return deleted ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Không tìm thấy user.' }, { status: 404 }); } catch (error) { return errorResponse(error) ?? NextResponse.json({ error: 'Không thể xóa user.' }, { status: 500 }); } }
