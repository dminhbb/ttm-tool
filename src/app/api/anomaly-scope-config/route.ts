import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getAnomalyScopeConfigWithMeta, saveAnomalyScopeConfig } from '@/lib/anomaly-scope-config-service';
import type { AnomalyScopeConfig } from '@/lib/scoring/parameters';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';

export const maxDuration = 300;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình Phạm vi rule Sai lệch dữ liệu.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

function isValidDateOrNull(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' || trimmed === 'none' || /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json(await getAnomalyScopeConfigWithMeta());
  } catch (error: unknown) {
    console.error('API Error in anomaly-scope-config GET:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải Phạm vi rule Sai lệch dữ liệu.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const { enabled, rules } = body as Record<string, unknown>;
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Giá trị master toggle không hợp lệ.' }, { status: 400 });
    }
    if (typeof rules !== 'object' || rules === null) {
      return NextResponse.json({ error: 'Danh sách rule không hợp lệ.' }, { status: 400 });
    }

    const cleanRules: AnomalyScopeConfig['rules'] = {};
    for (const [key, val] of Object.entries(rules as Record<string, unknown>)) {
      if (typeof val !== 'object' || val === null) continue;
      const r = val as Record<string, unknown>;
      const ruleEnabled = Boolean(r.enabled);
      const createdAfter = isValidDateOrNull(r.createdAfter) ? (r.createdAfter as string | null) || null : null;
      const startAfter = isValidDateOrNull(r.startAfter) ? (r.startAfter as string | null) || null : null;
      const r4gAfter = isValidDateOrNull(r.r4gAfter) ? (r.r4gAfter as string | null) || null : null;
      const dueAfter = isValidDateOrNull(r.dueAfter) ? (r.dueAfter as string | null) || null : null;
      cleanRules[key] = {
        enabled: ruleEnabled,
        createdAfter,
        startAfter,
        r4gAfter,
        dueAfter,
      };
    }

    const config: AnomalyScopeConfig = {
      enabled,
      rules: cleanRules,
    };

    await saveAnomalyScopeConfig(config, user.id);
    scheduleDerivedCacheRefresh('anomaly-scope-config');

    return NextResponse.json({ ...(await getAnomalyScopeConfigWithMeta()), refreshing: true });
  } catch (error: unknown) {
    console.error('API Error in anomaly-scope-config PUT:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể lưu Phạm vi rule Sai lệch dữ liệu.' }, { status: 500 });
  }
}
