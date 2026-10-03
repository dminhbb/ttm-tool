import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, listManagedUsers } from '@/lib/auth-service';
import { loadDashboardEpicRows } from '@/lib/ttm-dashboard-summary-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { resolveViewAsTarget, VIEW_AS_ALLOWED_ROLES, VIEW_AS_ROLE_RANK } from '@/lib/view-as-user-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const isAdminOrSupervisor = VIEW_AS_ALLOWED_ROLES.includes(actor.role);
    const actorRank = VIEW_AS_ROLE_RANK[actor.role] ?? 1;
    const { userId: targetUserId, role: targetRole, viewAsUser } = await resolveViewAsTarget(actor, request.nextUrl.searchParams.get('viewAsUserId'));

    // Same row source the MCP tool get_ttm_dashboard uses — see loadDashboardEpicRows
    // (ttm-dashboard-summary-service.ts): epic_alert_row_cache scoped to this viewer, falling back
    // to the live computation only while the cache is still empty.
    const loadRows = () => loadDashboardEpicRows(targetUserId, targetRole);

    const [context, ttmIndexGlobal, allUsers] = await Promise.all([
      loadRows(),
      getTtmIndexGlobalCache().catch((err) => {
        console.error('Failed to get TTM Index Global Cache:', err);
        return null;
      }),
      isAdminOrSupervisor ? listManagedUsers() : Promise.resolve([]),
    ]);

    const managedUsers: Array<{ domainIds: number[]; email: string; fullName: string; id: number; isActive: boolean; projectIds: number[]; role: string }> = allUsers
      .filter((u) => u.isActive && (VIEW_AS_ROLE_RANK[u.role] ?? 1) <= actorRank)
      .map((u) => ({
        domainIds: u.domainIds,
        email: u.email,
        fullName: u.fullName,
        id: u.id,
        isActive: u.isActive,
        projectIds: u.projectIds,
        role: u.role,
      }));

    return NextResponse.json({
      actor: { email: actor.email, fullName: actor.fullName, id: actor.id, role: actor.role },
      isUserPreview: Boolean(viewAsUser),
      lastAggregatedAt: context.lastAggregatedAt,
      managedUsers,
      rows: context.rows,
      ttmIndexGlobal,
      viewAsUser,
    });
  } catch (error) {
    console.error('Dashboard New API error:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải dữ liệu Dashboard New.' }, { status: 500 });
  }
}
