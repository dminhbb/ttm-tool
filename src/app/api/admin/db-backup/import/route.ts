import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { markCacheStale, withCacheStale } from '@/lib/daily-cache-service';
import { importSqlFile, previewImportFile } from '@/lib/db-backup-service';

export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ CBQL Phòng (SUPERADMIN) mới có quyền sao lưu/phục hồi dữ liệu.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireUser(request, ['SUPERADMIN']);
    // Read the file as the raw request body (client sends it directly, not multipart/form-data —
    // see admin/database/page.tsx) rather than through request.formData(). Node's built-in
    // multipart parser (undici) throws "Failed to parse body as FormData" on real SQL exports
    // above ~10.5MB — confirmed directly (reproducible on this exact codepath before this change
    // too, so not something introduced here) — while a plain request.text() body has no such
    // limit up to MAX_UPLOAD_BYTES.
    const sqlText = await request.text();
    const byteLength = Buffer.byteLength(sqlText, 'utf8');
    if (byteLength === 0 || byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `Chỉ chấp nhận file .sql tối đa ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` }, { status: 400 });
    }

    const url = new URL(request.url);
    const isDryRun = url.searchParams.get('dryRun') === '1';

    if (isDryRun) {
      const result = previewImportFile(sqlText);
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result.preview);
    }

    // "Bảng nào không được checked thì sẽ không import dữ liệu" — the preview's per-table
    // checkboxes (admin/database/page.tsx) send the checked set as ?tables=a,b,c. Omitted entirely
    // (no ?tables param at all) means "import every table found in the file", unchanged from
    // before this parameter existed; an explicit empty string means "nothing selected" (all data
    // skipped, only CREATE TABLE statements if any would run) rather than falling back to "all".
    const tablesParam = url.searchParams.get('tables');
    const selectedTables = tablesParam === null ? null : new Set(tablesParam.split(',').map((name) => name.trim()).filter(Boolean));

    // ?simulate=1 — runs the whole import and rolls it back: per-table inserted / updated / DELETED rows,
    // so the screen can ask before an import that removes data (mirror of the file, Smart clean-up).
    if (url.searchParams.get('simulate') === '1') {
      return NextResponse.json(await importSqlFile(sqlText, selectedTables, { actorUserId: actor.id, dryRun: true }));
    }

    const result = await importSqlFile(sqlText, selectedTables, { actorUserId: actor.id });
    // A restored backup replaces the data the caches were built from — marked stale, rebuilt by hand (2026-10-27).
    return withCacheStale(NextResponse.json(result, { status: result.ok ? 200 : 400 }), result.ok ? await markCacheStale('sql-import') : undefined);
  } catch (error: unknown) {
    console.error('API Error in db-backup/import route:', error);
    return authError(error) ?? NextResponse.json({ error: 'Không thể import dữ liệu.' }, { status: 500 });
  }
}
