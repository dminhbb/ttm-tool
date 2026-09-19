import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import pool from '@/lib/db';

/** Lightweight count for the sidebar's "Quản lý User" red dot — avoids fetching the full user
 * list / ticket list just to know whether either queue is non-empty (see admin/users/page.tsx for
 * the two full-detail queries this mirrors: pending password_reset_requests + inactive users). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']);
    const result = await pool.query<{ total: string }>(`
      SELECT
        (SELECT COUNT(*) FROM password_reset_requests WHERE status = 'PENDING')
        + (SELECT COUNT(*) FROM users WHERE is_active = FALSE) AS total;
    `);
    return NextResponse.json({ total: Number(result.rows[0]?.total ?? 0) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền xem thống kê này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    }
    return NextResponse.json({ error: 'Không thể tải số lượng ticket.' }, { status: 500 });
  }
}
