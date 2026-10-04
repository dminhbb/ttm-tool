import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, listManagedUsers } from '@/lib/auth-service';
import pool from '@/lib/db';
import { getTtmDashboard2Snapshot } from '@/lib/ttm-dashboard-2-cache-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import { resolveViewAsTarget, VIEW_AS_ALLOWED_ROLES, VIEW_AS_ROLE_RANK } from '@/lib/view-as-user-service';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);

    // Only allow Supervisor, Admin, or Superadmin
    if (!VIEW_AS_ALLOWED_ROLES.includes(actor.role)) {
      return NextResponse.json(
        { error: 'Bạn không có quyền truy cập chức năng này (Yêu cầu role Supervisor trở lên).' },
        { status: 403 }
      );
    }

    const target = await resolveViewAsTarget(actor, request.nextUrl.searchParams.get('viewAsUserId'));
    const actorRank = VIEW_AS_ROLE_RANK[actor.role] ?? 1;

    // Unfiltered funnel numbers + filter options straight from the per-scope cache; the Epic rows
    // themselves are only fetched (./rows) once the user applies a toolbar filter.
    const [snapshot, latestBatch, ttmIndexGlobal, allUsers] = await Promise.all([
      getTtmDashboard2Snapshot(target.userId, target.role),
      pool.query<{ aggregatedAt: string }>('SELECT aggregated_at::text AS "aggregatedAt" FROM import_batches ORDER BY aggregated_at DESC LIMIT 1;'),
      getTtmIndexGlobalCache().catch((err) => {
        console.error('Failed to get TTM Index Global Cache:', err);
        return null;
      }),
      listManagedUsers(),
    ]);

    const managedUsers = allUsers
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
      isUserPreview: Boolean(target.viewAsUser),
      cache: snapshot.cache,
      filterOptions: snapshot.filterOptions,
      lastAggregatedAt: latestBatch.rows[0]?.aggregatedAt ?? null,
      managedUsers,
      summary: snapshot.summary,
      ttmIndexGlobal,
      viewAsUser: target.viewAsUser,
    });
  } catch (error) {
    console.error('TTM Dashboard 2 API error:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải dữ liệu TTM Dashboard 2.' }, { status: 500 });
  }
}
