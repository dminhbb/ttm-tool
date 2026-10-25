import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';
import { parseRuleGroupDrafts, ruleGroupErrorResponse } from '@/lib/rule-group-request';
import { getRuleGroupConfig, saveRuleGroupConfig } from '@/lib/rule-group-service';

/** Rule Management (SUPERADMIN): GET the Rule Groups + rule catalog, PUT the whole configuration. */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json(await getRuleGroupConfig());
  } catch (error: unknown) {
    return ruleGroupErrorResponse(error, 'Không thể tải cấu hình nhóm rule.');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const record = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const groups = parseRuleGroupDrafts(record.groups);
    const baseVersion = Number(record.baseVersion);
    if (!groups || !Number.isInteger(baseVersion)) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    const saved = await saveRuleGroupConfig(groups, baseVersion, user.id);
    // Every verdict may change — rebuild the row cache and the caches derived from it, like any scoring config save.
    scheduleDerivedCacheRefresh('rule-groups');
    return NextResponse.json({ ...saved, refreshing: true });
  } catch (error: unknown) {
    return ruleGroupErrorResponse(error, 'Không thể lưu cấu hình nhóm rule.');
  }
}
