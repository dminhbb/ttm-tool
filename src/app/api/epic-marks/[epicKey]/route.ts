import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getEpicBrowserSummary } from '@/lib/epic-browser-service';
import { canSetEpicTaskStatus, isEpicTaskStatus, normalizeCommentText, EPIC_COMMENT_MAX_LENGTH } from '@/lib/epic-mark-format';
import { addEpicComment, commentAuthorName, deleteOwnEpicComment, getEpicMarkDetail, getEpicTaskState, resolveEpicMarkAccess, setEpicHidden, setEpicTaskStatus } from '@/lib/epic-mark-service';
import { resolveViewAsTarget } from '@/lib/view-as-user-service';

/**
 * "Review Notes" (formerly "Mark & Comment") of one Epic. Anyone whose data scope contains the Epic may read it and write to it:
 * its PM/SMs, the ADMIN of its Domain/project, SUPERVISOR and SUPERADMIN (see resolveEpicMarkAccess).
 * Hide/Unhide is personal (epic_hidden_by_users): `isHidden` is the viewer's own choice. With `?viewAsUserId=`
 * ("Xem dưới quyền") the GET reports the previewed user's choice instead, and Hide/Unhide is not offered.
 * "Giao việc" (`task`) is one TODO/DONE state per Epic; `canToggleTask` = the viewer may switch it (never under view-as).
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
    const access = await resolveEpicMarkAccess(user, epicKey, { withScoring: true });
    if (!access) return OUT_OF_SCOPE();
    const { userId: hiddenForUserId, viewAsUser } = await resolveViewAsTarget(user, request.nextUrl.searchParams.get('viewAsUserId'));
    const [detail, summary, task] = await Promise.all([getEpicMarkDetail(epicKey, hiddenForUserId, user.id), getEpicBrowserSummary(epicKey), getEpicTaskState(epicKey)]);
    const viewerName = commentAuthorName(user);
    return NextResponse.json({
      ...detail,
      canToggleHidden: viewAsUser === null,
      canToggleTask: viewAsUser === null && canSetEpicTaskStatus(user.role, viewerName, access.ownerNames),
      epicKey,
      epicName: summary?.epicName || access.epicName,
      ownerName: access.ownerName,
      scoring: access.scoring,
      summary,
      task,
      viewerName,
    });
  } catch (error: unknown) {
    console.error('API Error loading epic mark:', error);
    return errorResponse(error, 'Không thể tải Review Notes của Epic.');
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

/** Deletes the signed-in user's OWN comment (body { commentId }): its text becomes "~~deleted~~", once. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const epicKey = await epicKeyOf(context);
    const commentId = Number(((await request.json().catch(() => null)) as { commentId?: unknown } | null)?.commentId);
    if (!Number.isSafeInteger(commentId) || commentId < 1) return NextResponse.json({ error: 'Comment không hợp lệ.' }, { status: 400 });
    if (!(await resolveEpicMarkAccess(user, epicKey))) return OUT_OF_SCOPE();
    if (!(await deleteOwnEpicComment(epicKey, commentId, user.id))) {
      return NextResponse.json({ error: 'Chỉ xóa được comment của chính bạn và chỉ xóa một lần.' }, { status: 409 });
    }
    return NextResponse.json({ deleted: true, ...(await getEpicMarkDetail(epicKey, user.id, user.id)) });
  } catch (error: unknown) {
    console.error('API Error deleting epic comment:', error);
    return errorResponse(error, 'Không thể xóa comment.');
  }
}

/**
 * Body { hidden }: hides / unhides the Epic for the signed-in user only (no comment is written).
 * Body { taskStatus: 'TODO' | 'DONE' }: switches "Giao việc" — the Epic's PM/SMs and ADMIN / SUPERADMIN only.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const epicKey = await epicKeyOf(context);
    const body = (await request.json().catch(() => null)) as { hidden?: unknown; taskStatus?: unknown } | null;
    if (body?.taskStatus !== undefined) {
      if (!isEpicTaskStatus(body.taskStatus)) return NextResponse.json({ error: 'Giá trị Giao việc không hợp lệ.' }, { status: 400 });
      const access = await resolveEpicMarkAccess(user, epicKey);
      if (!access) return OUT_OF_SCOPE();
      if (!canSetEpicTaskStatus(user.role, commentAuthorName(user), access.ownerNames)) {
        return NextResponse.json({ error: 'Chỉ PM/SM của Epic hoặc ADMIN trở lên được đổi Giao việc.' }, { status: 403 });
      }
      const changed = await setEpicTaskStatus(epicKey, body.taskStatus, user.id);
      return NextResponse.json({ changed, task: await getEpicTaskState(epicKey) });
    }
    const hidden = body?.hidden;
    if (typeof hidden !== 'boolean') return NextResponse.json({ error: 'Giá trị Hide/Unhide không hợp lệ.' }, { status: 400 });
    if (!(await resolveEpicMarkAccess(user, epicKey))) return OUT_OF_SCOPE();
    const changed = await setEpicHidden(epicKey, hidden, user.id);
    return NextResponse.json({ changed, ...(await getEpicMarkDetail(epicKey, user.id, user.id)) });
  } catch (error: unknown) {
    console.error('API Error updating epic mark:', error);
    return errorResponse(error, 'Không thể lưu thay đổi.');
  }
}
