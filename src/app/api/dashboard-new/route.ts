import { NextRequest, NextResponse } from 'next/server';
import { requireUser, listManagedUsers } from '@/lib/auth-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import pool from '@/lib/db';
import type { UserRole } from '@/lib/auth-types';

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

    if (isAdminOrSupervisor && viewAsUserId && viewAsUserId !== actor.id) {
      const userRes = await pool.query<{ email: string; fullName: string; id: number; role: string }>(
        `SELECT id, full_name AS "fullName", email, role FROM users WHERE id = $1 AND is_active = TRUE`,
        [viewAsUserId]
      );
      if (userRes.rows.length > 0) {
        const u = userRes.rows[0];
        targetUserId = u.id;
        targetRole = 'USER';
        viewAsUser = { email: u.email, fullName: u.fullName, id: u.id, role: u.role };
      }
    }

    const context = await getEpicAlertRowsPhased(targetUserId, targetRole);

    let managedUsers: Array<{ domainIds: number[]; email: string; fullName: string; id: number; isActive: boolean; projectIds: number[]; role: string }> = [];
    if (isAdminOrSupervisor) {
      const allUsers = await listManagedUsers();
      managedUsers = allUsers
        .filter((u) => u.isActive)
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
      viewAsUser,
    });
  } catch (error) {
    console.error('Dashboard New API error:', error);
    return NextResponse.json({ error: 'Không thể tải dữ liệu Dashboard New.' }, { status: 500 });
  }
}
