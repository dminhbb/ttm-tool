import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { isValidThinningDailyLimit, MAX_THINNING_DAILY_LIMIT, MIN_THINNING_DAILY_LIMIT } from '@/lib/data-layer-retention';
import { getHistoryThinningSettings, saveHistoryThinningSettings } from '@/lib/data-layer-retention-service';
import { getDataRetentionConfig } from '@/lib/data-retention-service';

/**
 * Tab "Dọn lịch sử" of Quản trị nguồn dữ liệu (SUPERADMIN): the switch and the daily limit of the thinning of the
 * `issues` history, plus the outcome of its last run. The preview and the manual run reuse /api/admin/db-cleanup.
 */

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Chỉ SUPERADMIN được cấu hình việc dọn lịch sử dữ liệu.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const [settings, retention] = await Promise.all([getHistoryThinningSettings(), getDataRetentionConfig()]);
    return NextResponse.json({ ...settings, rawImportRetentionDays: retention.rawImportRetentionDays });
  } catch (error: unknown) {
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải cấu hình dọn lịch sử.' }, { status: 500 });
  }
}

/** { enabled?: boolean, dailyLimit?: number } — either or both. */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const record = (typeof body === 'object' && body !== null ? body : {}) as { dailyLimit?: unknown; enabled?: unknown };
    if (record.enabled !== undefined && typeof record.enabled !== 'boolean') return NextResponse.json({ error: 'Giá trị bật/tắt không hợp lệ.' }, { status: 400 });
    if (record.dailyLimit !== undefined && !isValidThinningDailyLimit(record.dailyLimit)) {
      return NextResponse.json({ error: `Giới hạn mỗi lượt phải là số nguyên từ ${MIN_THINNING_DAILY_LIMIT} đến ${MAX_THINNING_DAILY_LIMIT}.` }, { status: 400 });
    }
    if (record.enabled === undefined && record.dailyLimit === undefined) return NextResponse.json({ error: 'Không có thay đổi nào.' }, { status: 400 });
    const settings = await saveHistoryThinningSettings({ dailyLimit: record.dailyLimit as number | undefined, enabled: record.enabled as boolean | undefined }, user.id);
    const retention = await getDataRetentionConfig();
    return NextResponse.json({ ...settings, rawImportRetentionDays: retention.rawImportRetentionDays });
  } catch (error: unknown) {
    return authError(error) ?? NextResponse.json({ error: 'Không thể lưu cấu hình dọn lịch sử.' }, { status: 500 });
  }
}
