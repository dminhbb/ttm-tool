import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, listManagedUsers } from '@/lib/auth-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { getTtmIndexGlobalCache } from '@/lib/ttm-index-global-cache-service';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem màn hình này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

const ROLE_RANK: Record<string, number> = {
  SUPERADMIN: 4,
  SUPERVISOR: 3,
  ADMIN: 2,
  USER: 1,
};

export async function GET(request: NextRequest) {
  try {
    const actor = await requireUser(request);
    const searchParams = request.nextUrl.searchParams;
    const viewAsUserIdStr = searchParams.get('viewAsUserId');
    const viewAsUserId = viewAsUserIdStr ? parseInt(viewAsUserIdStr, 10) : null;

    let targetUserId = actor.id;
    let targetRole: UserRole = actor.role;
    let viewAsUser: { email: string; fullName: string; id: number; role: string } | null = null;

    const isAdminOrSupervisor = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR'].includes(actor.role);
    const actorRank = ROLE_RANK[actor.role] ?? 1;

    if (isAdminOrSupervisor && viewAsUserId && viewAsUserId !== actor.id) {
      const userRes = await pool.query<{ email: string; fullName: string; id: number; role: string }>(
        `SELECT id, full_name AS "fullName", email, role FROM users WHERE id = $1 AND is_active = TRUE`,
        [viewAsUserId]
      );
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        const targetRank = ROLE_RANK[u.role] ?? 1;
        // Only allow switching to users with role equal to or lower than actor's role
        if (targetRank <= actorRank) {
          targetUserId = u.id;
          targetRole = 'USER';
          viewAsUser = { email: u.email, fullName: u.fullName, id: u.id, role: u.role };
        }
      }
    }

    const [context, ttmIndexGlobal] = await Promise.all([
      getEpicAlertRowsPhased(targetUserId, targetRole),
      getTtmIndexGlobalCache().catch((err) => {
        console.error('Failed to get TTM Index Global Cache:', err);
        return null;
      }),
    ]);

    let managedUsers: Array<{ domainIds: number[]; email: string; fullName: string; id: number; isActive: boolean; projectIds: number[]; role: string }> = [];
    if (isAdminOrSupervisor) {
      const allUsers = await listManagedUsers();
      managedUsers = allUsers
        .filter((u) => u.isActive && (ROLE_RANK[u.role] ?? 1) <= actorRank)
        .map((u) => ({
          domainIds: u.domainIds,
          email: u.email,
          fullName: u.fullName,
          id: u.id,
          isActive: u.isActive,
          projectIds: u.projectIds,
          role: u.role,
        }));
    }

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
