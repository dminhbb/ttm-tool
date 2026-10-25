import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { previewRuleGroups } from '@/lib/rule-group-preview-service';
import { parseRuleGroupDrafts, ruleGroupErrorResponse } from '@/lib/rule-group-request';

// Scores every Epic twice (saved vs draft configuration).
export const maxDuration = 300;

/** Rule Management — "Xem trước tác động" of a draft configuration, nothing saved (SUPERADMIN). */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    const body: unknown = await request.json();
    const groups = parseRuleGroupDrafts((typeof body === 'object' && body !== null ? (body as Record<string, unknown>).groups : null));
    if (!groups) return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    return NextResponse.json(await previewRuleGroups(groups));
  } catch (error: unknown) {
    return ruleGroupErrorResponse(error, 'Không thể xem trước tác động của cấu hình nhóm rule.');
  }
}
