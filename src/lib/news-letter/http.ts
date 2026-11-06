import 'server-only';
import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth-service';
import type { AuthUser } from '@/lib/auth-types';
import { NewsLetterError, type NewsLetterViewer } from '@/lib/news-letter/service';

/** Shared by the /api/news-letter routes. */
export function viewerOf(user: AuthUser): NewsLetterViewer {
  return { id: user.id, role: user.role };
}

export function newsLetterErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền thực hiện thao tác này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  if (error instanceof NewsLetterError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** A positive integer route / query parameter, else null. */
export function positiveInt(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}
