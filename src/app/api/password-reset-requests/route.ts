import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser, resetUserPassword } from '@/lib/auth-service';
import { verifyCaptcha } from '@/lib/captcha-service';

type ResetTarget = { id: number; userId: number };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isResetTarget(value: unknown): value is ResetTarget { return isRecord(value) && Number.isInteger(value.id) && (value.id as number) > 0 && Number.isInteger(value.userId) && (value.userId as number) > 0; }
function authError(error: unknown): NextResponse | null { if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý yêu cầu cấp lại mật khẩu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 }); return null; }

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const { default: pool } = await import('@/lib/db');
    const result = await pool.query('SELECT pr.id, pr.email, pr.created_at AS "createdAt", u.id AS "userId" FROM password_reset_requests pr LEFT JOIN users u ON u.email = pr.email WHERE pr.status = \'PENDING\' ORDER BY pr.created_at DESC');
    return NextResponse.json(result.rows);
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể tải ticket.' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.email !== 'string' || typeof body.captcha !== 'string' || typeof body.captchaId !== 'string' || !verifyCaptcha(body.captchaId, body.captcha)) return NextResponse.json({ error: 'Email hoặc CAPTCHA không hợp lệ.' }, { status: 400 });
    const { default: pool } = await import('@/lib/db');
    const email = body.email.trim().toLowerCase();
    const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (user.rowCount !== 1) return NextResponse.json({ error: 'Email chưa tồn tại trong hệ thống.' }, { status: 404 });
    await pool.query('INSERT INTO password_reset_requests (email) VALUES ($1)', [email]);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Không thể tạo ticket.' }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 256) return NextResponse.json({ error: 'Mật khẩu mới không hợp lệ.' }, { status: 400 });
    const targets: ResetTarget[] = Array.isArray(body.tickets) ? body.tickets.filter(isResetTarget) : isResetTarget(body) ? [{ id: body.id, userId: body.userId }] : [];
    if (targets.length === 0 || targets.length > 100 || targets.length !== new Set(targets.map((target) => target.id)).size) return NextResponse.json({ error: 'Danh sách yêu cầu cấp lại mật khẩu không hợp lệ.' }, { status: 400 });
    const { default: pool } = await import('@/lib/db');
    const pending = await pool.query<{ id: number; userId: number | null }>('SELECT pr.id, u.id AS "userId" FROM password_reset_requests pr LEFT JOIN users u ON u.email = pr.email WHERE pr.status = \'PENDING\' AND pr.id = ANY($1::int[])', [targets.map((target) => target.id)]);
    if (pending.rowCount !== targets.length || pending.rows.some((row) => row.userId === null || row.userId !== targets.find((target) => target.id === row.id)?.userId)) return NextResponse.json({ error: 'Có yêu cầu không còn hợp lệ hoặc không khớp user.' }, { status: 409 });
    for (const target of targets) await resetUserPassword(target.userId, body.password, actor.id);
    await pool.query('UPDATE password_reset_requests SET status = \'RESOLVED\', resolved_at = CURRENT_TIMESTAMP, resolved_by = $2 WHERE id = ANY($1::int[]) AND status = \'PENDING\'', [targets.map((target) => target.id), actor.id]);
    return NextResponse.json({ success: true, processed: targets.length });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể cấp lại mật khẩu.' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100 || !body.ids.every((id) => Number.isInteger(id) && id > 0)) return NextResponse.json({ error: 'Danh sách ticket không hợp lệ.' }, { status: 400 });
    const { default: pool } = await import('@/lib/db');
    const result = await pool.query('DELETE FROM password_reset_requests WHERE id = ANY($1::int[]) AND status = \'PENDING\'', [body.ids]);
    return NextResponse.json({ success: true, deleted: result.rowCount });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể xóa ticket.' }, { status: 500 }); }
}
