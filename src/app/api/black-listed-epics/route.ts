import { after, NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import type { UserRole } from '@/lib/auth-types';
import { listBlackListedEpics, replaceBlackListedEpics, setEpicBlackListed } from '@/lib/black-listed-epic-service';
import { formatBlackListText, parseBlackListText, projectKeyOfEpicKey } from '@/lib/black-listed-epics-format';
import { getLatestImportBatchId, refreshDerivedCachesInBackground } from '@/lib/daily-cache-service';

// A changed black list rebuilds the derived caches in after() — past the response — since L02 of the
// TTM Dashboard 2 funnel and every TTM ratio depend on it (same cost as a post-import refresh).
export const maxDuration = 300;

// Same split as the other admin config screens: SUPERVISOR may look, only ADMIN/SUPERADMIN change.
const VIEW_ROLES: UserRole[] = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'];
const EDIT_ROLES: UserRole[] = ['ADMIN', 'SUPERADMIN'];

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền thực hiện thao tác này với Epic ngoại lệ.' : 'Chưa đăng nhập.' },
      { status: error.code === 'FORBIDDEN' ? 403 : 401 },
    );
  }
  return null;
}

async function snapshot(role: UserRole) {
  const list = await listBlackListedEpics();
  return { canEdit: EDIT_ROLES.includes(role), count: list.entries.length, text: formatBlackListText(list.entries), updatedAt: list.updatedAt, updatedByName: list.updatedByName };
}

async function refreshCaches(source: string): Promise<void> {
  const batchId = await getLatestImportBatchId();
  after(() => refreshDerivedCachesInBackground(batchId, source));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request, VIEW_ROLES);
    return NextResponse.json(await snapshot(user.role));
  } catch (error: unknown) {
    console.error('API Error loading black listed epics:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể tải danh sách Epic ngoại lệ.' }, { status: 500 });
  }
}

/** The "Epic ngoại lệ" popup: the whole list as text. Nothing is stored unless the format is valid. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request, EDIT_ROLES);
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || typeof (body as { text?: unknown }).text !== 'string') {
      return NextResponse.json({ error: 'Dữ liệu Epic ngoại lệ không hợp lệ.' }, { status: 400 });
    }
    const { entries, errors } = parseBlackListText((body as { text: string }).text);
    if (errors.length > 0) {
      return NextResponse.json({ error: `Thông tin nhập chưa đúng định dạng (${errors.length} lỗi) — chưa lưu.`, formatErrors: errors }, { status: 400 });
    }

    const { added, removed } = await replaceBlackListedEpics(entries, user.id);
    const changed = added.length + removed.length > 0;
    if (changed) await refreshCaches('black-listed-epics');
    return NextResponse.json({ ...(await snapshot(user.role)), added, refreshing: changed, removed });
  } catch (error: unknown) {
    console.error('API Error saving black listed epics:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể lưu danh sách Epic ngoại lệ.' }, { status: 500 });
  }
}

/** The form in Duyệt Epic: one Epic's "TTM Black listed" true/false. */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser(request, EDIT_ROLES);
    const body: unknown = await request.json();
    const input = (typeof body === 'object' && body !== null ? body : {}) as { blackListed?: unknown; epicKey?: unknown };
    const epicKey = typeof input.epicKey === 'string' ? input.epicKey.trim().toUpperCase() : '';
    const projectKey = projectKeyOfEpicKey(epicKey);
    if (!projectKey || typeof input.blackListed !== 'boolean') {
      return NextResponse.json({ error: 'Epic key hoặc giá trị TTM Black listed không hợp lệ.' }, { status: 400 });
    }

    const changed = await setEpicBlackListed({ epicKey, projectKey }, input.blackListed, user.id);
    if (changed) await refreshCaches('black-listed-epic');
    return NextResponse.json({ blackListed: input.blackListed, epicKey, refreshing: changed });
  } catch (error: unknown) {
    console.error('API Error updating a black listed epic:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể lưu TTM Black listed của Epic.' }, { status: 500 });
  }
}
