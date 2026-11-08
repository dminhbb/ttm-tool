import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_RATE_LIMITS, rateLimitResponse } from '@/lib/api-rate-limit';
import { getMcpSettings } from '@/lib/mcp-service';
import { linkifyRichHtml } from '@/lib/rich-html-sanitizer';
import { DEFAULT_SUSPENSION_MESSAGE_HTML, type PublicSystemSuspension } from '@/lib/system-suspension';
import { getSystemSuspension } from '@/lib/system-suspension-service';

export const dynamic = 'force-dynamic';

/**
 * Public (pre-login): what the full-screen page /suspended and the login page show while "Tạm dừng hệ thống" is ON.
 * Nothing else is disclosed — when the system runs normally only `isSuspended: false` comes back. The message was
 * sanitized when it was stored and is sanitized again here, before it reaches any browser.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request, 'systemSuspension', PUBLIC_RATE_LIMITS.systemSuspension);
  if (limited) return limited;
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const state = await getSystemSuspension();
    if (!state.isSuspended) return NextResponse.json({ isSuspended: false }, { headers });
    const mcpEnabled = state.allowMcp ? await getMcpSettings().then((settings) => settings.isEnabled, () => false) : false;
    const body: PublicSystemSuspension = {
      allowMcp: state.allowMcp,
      allowNewsLetter: state.allowNewsLetter,
      isSuspended: true,
      mcpEnabled,
      messageHtml: linkifyRichHtml(state.messageHtml) || DEFAULT_SUSPENSION_MESSAGE_HTML,
    };
    return NextResponse.json(body, { headers });
  } catch (error: unknown) {
    console.error('API Error loading system suspension:', error);
    return NextResponse.json({ error: 'Không thể tải trạng thái hệ thống.' }, { status: 500, headers });
  }
}
