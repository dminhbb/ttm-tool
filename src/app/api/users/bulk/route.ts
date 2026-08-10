import { NextRequest, NextResponse } from 'next/server';
import { AuthError, createInactiveUsersFromUsernames, requireUser } from '@/lib/auth-service';

const MAX_BULK_USERS = 100;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('usernames' in body) || !Array.isArray(body.usernames) || body.usernames.length === 0 || body.usernames.length > MAX_BULK_USERS || !body.usernames.every((username) => typeof username === 'string')) return NextResponse.json({ error: `Danh sách username không hợp lệ; tối đa ${MAX_BULK_USERS} user.` }, { status: 400 });
    const usernames = Array.from(new Set(body.usernames.map((username) => username.trim().toLowerCase()).filter((username) => USERNAME_PATTERN.test(username))));
    if (usernames.length === 0 || usernames.length !== body.usernames.length) return NextResponse.json({ error: 'Username chỉ được gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' }, { status: 400 });
    return NextResponse.json(await createInactiveUsersFromUsernames(usernames), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý user.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    return NextResponse.json({ error: 'Không thể thêm nhiều user.' }, { status: 500 });
  }
}
