import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { markCacheStale, withCacheStale } from '@/lib/daily-cache-service';
import { parseRuleGroupDrafts, ruleGroupErrorResponse } from '@/lib/rule-group-request';
import { getRuleGroupConfig, saveRuleGroupConfig } from '@/lib/rule-group-service';

// The PUT only marks the caches stale (markCacheStale) — the rebuild is manual since 2026-10-27; it used to run in after() — same
// budget as the other config saves that do, e.g. api/projects, api/domains (it only matters on Vercel).
export const maxDuration = 300;

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
    // Every verdict may change, but since 2026-10-27 the caches are rebuilt by hand ("Tạo lại cache"): mark them stale.
    return withCacheStale(NextResponse.json({ ...saved, refreshing: false }), await markCacheStale('rule-groups'));
  } catch (error: unknown) {
    return ruleGroupErrorResponse(error, 'Không thể lưu cấu hình nhóm rule.');
  }
}
