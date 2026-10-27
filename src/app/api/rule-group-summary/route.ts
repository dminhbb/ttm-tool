import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { listRuleGroupSummary } from '@/lib/rule-group-summary';

/**
 * Read-only view of the Rule Groups in force, for the "Logic cảnh báo" popup — every signed-in user (the popup's
 * own "Xem" is the permission matrix's help_alert_logic). Editing stays on Rule Management (SUPERADMIN).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const items = await listRuleGroupSummary();
    return NextResponse.json({ groups: items });
  } catch (error: unknown) {
    if (error instanceof AuthError) return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    console.error('API Error in rule-group-summary GET:', error);
    return NextResponse.json({ error: 'Không thể tải danh sách nhóm rule.' }, { status: 500 });
  }
}
