import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth-service';
import { DeniedImportError } from '@/lib/denied-import-service';
import { parseEpicKeyList } from '@/lib/import-admission-rules';

/** Shared error mapping of the "Từ chối import" / Epic deletion routes (SUPERADMIN only). */
export function dataSourceErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản trị Nguồn dữ liệu.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  if (error instanceof DeniedImportError || error instanceof EpicKeyInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export class EpicKeyInputError extends Error {}

/** Epic keys of a request (array or free text); refuses an empty list or a malformed key. */
export function requireEpicKeys(value: unknown): string[] {
  const input = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? value : '';
  const { invalid, keys } = parseEpicKeyList(input);
  if (invalid.length > 0) throw new EpicKeyInputError(`Epic key không hợp lệ: ${invalid.join(', ')}.`);
  if (keys.length === 0) throw new EpicKeyInputError('Chưa nhập Epic key nào.');
  if (keys.length > 500) throw new EpicKeyInputError('Tối đa 500 Epic mỗi lần.');
  return keys;
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
