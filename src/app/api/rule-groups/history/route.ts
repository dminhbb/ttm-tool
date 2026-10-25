import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { ruleGroupErrorResponse } from '@/lib/rule-group-request';
import { listRuleGroupHistory } from '@/lib/rule-group-service';

/** Rule Management — "Lịch sử thay đổi": the newest saves of the Rule Group configuration (SUPERADMIN). */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json({ entries: await listRuleGroupHistory() });
  } catch (error: unknown) {
    return ruleGroupErrorResponse(error, 'Không thể tải lịch sử thay đổi nhóm rule.');
  }
}
