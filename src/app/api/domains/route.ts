import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { createDomain, deleteDomain, listDomains, updateDomain } from '@/lib/master-data-service';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';
import type { DomainInput, DomainSaveResult } from '@/lib/master-data-types';

// Reassigning projects between Domains rebuilds the derived caches in after() (see respond below),
// the same cost as a post-import refresh — see scheduleDerivedCacheRefresh in daily-cache-service.ts.
export const maxDuration = 300;

/** `projectIds` is optional (undefined = leave project assignments untouched); when present it must
 * be a list of positive integer project ids. Returns an error message, or null when valid. */
function validateProjectIds(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.some((id) => !Number.isInteger(id) || id <= 0)) return 'Danh sách dự án của Domain không hợp lệ.';
  return null;
}

/** epic_alert_row_cache stores each Epic's domainName (and "Quản trị Epic"'s Domain filter maps
 * domain → projects from it), so a changed project ↔ Domain assignment or a renamed Domain only
 * shows up there after a rebuild — kicked off in the background so saving stays instant. A new name
 * or active flag only reaches the caches through the Domain's active projects (getDomainByProjectKeyMap),
 * so a Domain without one needs no rebuild for those. */
function respond(result: DomainSaveResult, status = 200): NextResponse {
  const namesEpics = result.domain.projects.some((project) => project.isActive);
  const cacheAffected = result.projectsChanged || (namesEpics && (result.nameChanged || result.activeChanged));
  if (cacheAffected) scheduleDerivedCacheRefresh('domains');
  return NextResponse.json({ ...result.domain, cacheRefreshing: cacheAffected }, { status });
}

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý Domain.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  return null;
}

export async function GET(request: NextRequest) {
  try { await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listDomains()); }
  catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi tải danh sách Domain.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as DomainInput;
    if (!body.domainCode?.trim() || !body.domainName?.trim()) return NextResponse.json({ error: 'Domain Code và Tên Domain là bắt buộc.' }, { status: 400 });
    const projectIdsError = validateProjectIds(body.projectIds);
    if (projectIdsError) return NextResponse.json({ error: projectIdsError }, { status: 400 });
    return respond(await createDomain(body), 201);
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi tạo Domain.' }, { status: 500 }); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body = (await request.json()) as DomainInput & { id: number };
    if (!Number.isInteger(body.id) || body.id <= 0 || !body.domainCode?.trim() || !body.domainName?.trim()) return NextResponse.json({ error: 'Thiếu dữ liệu Domain bắt buộc.' }, { status: 400 });
    const projectIdsError = validateProjectIds(body.projectIds);
    if (projectIdsError) return NextResponse.json({ error: projectIdsError }, { status: 400 });
    return respond(await updateDomain(body.id, body));
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi cập nhật Domain.' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Domain ID không hợp lệ.' }, { status: 400 });
    // The Domain's projects are left without one — when it was naming their Epics, the cached
    // domainName is now stale.
    const cacheAffected = await deleteDomain(id);
    if (cacheAffected) scheduleDerivedCacheRefresh('domains');
    return NextResponse.json({ success: true, cacheRefreshing: cacheAffected });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Lỗi hệ thống khi xóa Domain.' }, { status: 500 }); }
}
