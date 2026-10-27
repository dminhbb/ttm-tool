import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicBrowserSummary } from '@/lib/epic-browser-service';
import { normalizeCommentText, EPIC_COMMENT_MAX_LENGTH } from '@/lib/epic-mark-format';
import { addEpicComment, commentAuthorName, getEpicMarkDetail, resolveEpicMarkAccess, setEpicHidden } from '@/lib/epic-mark-service';

/**
 * "Mark & Comment" of one Epic. Anyone whose data scope contains the Epic may read it and write to it:
 * its PM/SMs, the ADMIN of its Domain/project, SUPERVISOR and SUPERADMIN (see resolveEpicMarkAccess).
 */

type RouteContext = { params: Promise<{ epicKey: string }> };

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền thực hiện thao tác này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

const OUT_OF_SCOPE = () => NextResponse.json({ error: 'Epic không nằm trong phạm vi dữ liệu của bạn.' }, { status: 403 });

async function epicKeyOf(context: RouteContext): Promise<string> {
  return (await context.params).epicKey.trim().toUpperCase();
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const epicKey = await epicKeyOf(context);
    const access = await resolveEpicMarkAccess(user, epicKey);
    if (!access) return OUT_OF_SCOPE();
    const [detail, summary] = await Promise.all([getEpicMarkDetail(epicKey), getEpicBrowserSummary(epicKey)]);
    return NextResponse.json({ ...detail, epicKey, epicName: summary?.epicName || access.epicName, ownerName: access.ownerName, summary, viewerName: commentAuthorName(user) });
  } catch (error: unknown) {
    console.error('API Error loading epic mark:', error);
    return errorResponse(error, 'Không thể tải Mark & Comment của Epic.');
  }
}

/** Adds one comment (body { comment }). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const epicKey = await epicKeyOf(context);
    const body: unknown = await request.json().catch(() => null);
    const comment = normalizeCommentText((body as { comment?: unknown } | null)?.comment);
    if (!comment) {
      return NextResponse.json({ error: `Comment không được để trống và tối đa ${EPIC_COMMENT_MAX_LENGTH} ký tự.` }, { status: 400 });
    }
    if (!(await resolveEpicMarkAccess(user, epicKey))) return OUT_OF_SCOPE();
    return NextResponse.json({ comment: await addEpicComment(epicKey, user, comment) });
  } catch (error: unknown) {
    console.error('API Error adding epic comment:', error);
    return errorResponse(error, 'Không thể lưu comment.');
  }
}

/** Hides / unhides the Epic (body { hidden }); a system comment records a real change. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const epicKey = await epicKeyOf(context);
    const body: unknown = await request.json().catch(() => null);
    const hidden = (body as { hidden?: unknown } | null)?.hidden;
    if (typeof hidden !== 'boolean') return NextResponse.json({ error: 'Giá trị Hide/Unhide không hợp lệ.' }, { status: 400 });
    if (!(await resolveEpicMarkAccess(user, epicKey))) return OUT_OF_SCOPE();
    const changed = await setEpicHidden(epicKey, hidden, user);
    return NextResponse.json({ changed, ...(await getEpicMarkDetail(epicKey)) });
  } catch (error: unknown) {
    console.error('API Error hiding epic:', error);
    return errorResponse(error, 'Không thể lưu trạng thái Hide/Unhide.');
  }
}
