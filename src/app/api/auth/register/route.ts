import { NextRequest, NextResponse } from 'next/server';
import { createManagedUser, DuplicateUsernameError, extractUsername, normalizeUsername } from '@/lib/auth-service';
import { verifyCaptcha } from '@/lib/captcha-service';
import { listDomains } from '@/lib/master-data-service';

const USERNAME_PATTERN = /^[a-z0-9._-]{1,100}$/;

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('email' in body) || !('fullName' in body) || !('password' in body) || !('domainId' in body) || !('captcha' in body) || !('captchaId' in body) || typeof body.email !== 'string' || typeof body.fullName !== 'string' || typeof body.password !== 'string' || typeof body.domainId !== 'number' || !Number.isInteger(body.domainId) || typeof body.captcha !== 'string' || typeof body.captchaId !== 'string' || !verifyCaptcha(body.captchaId, body.captcha)) return NextResponse.json({ error: 'Thông tin đăng ký, Domain hoặc CAPTCHA không hợp lệ.' }, { status: 400 });
    const rawEmail = body.email.trim().toLowerCase();
    const hasDomain = rawEmail.includes('@');
    const username = extractUsername(rawEmail);
    if (!USERNAME_PATTERN.test(username) || (hasDomain && !/^[^\s@]+@mbbank\.com\.vn$/i.test(rawEmail)) || body.fullName.trim().length === 0 || body.password.length < 8) return NextResponse.json({ error: 'Họ tên, username/email MB Bank hoặc mật khẩu không hợp lệ.' }, { status: 400 });
    if (!(await listDomains()).some((domain) => domain.id === body.domainId && domain.isActive)) return NextResponse.json({ error: 'Domain không tồn tại hoặc đã ngừng hoạt động.' }, { status: 400 });
    await createManagedUser({ email: normalizeUsername(rawEmail), fullName: body.fullName.trim(), password: body.password, role: 'USER', isActive: false, domainIds: [body.domainId], projectIds: [], projectComponents: {} });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof DuplicateUsernameError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return NextResponse.json({ error: 'Username hoặc email đã tồn tại trong hệ thống.' }, { status: 409 });
    console.error('Registration failed:', error);
    return NextResponse.json({ error: 'Không thể đăng ký.' }, { status: 500 });
  }
}
