import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getFloatMessagePriorities, getPublicFloatMessage } from '@/lib/float-message-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/float-message — the "Float message" a signed-in user sees right now (switched on, has text, today in its
 * date range), or { message: null }. Only what the box needs is returned (no editor, no configuration dates).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const [message, priorities] = await Promise.all([getPublicFloatMessage(), getFloatMessagePriorities()]);
    return NextResponse.json({ message, priorities }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error loading the float message:', error);
    // Optional decoration: a failure shows nothing rather than an error on every page.
    return NextResponse.json({ message: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
