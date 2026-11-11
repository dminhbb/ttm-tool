import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import pool from '@/lib/db';
import { resolveAccessScope } from '@/lib/epic-alert-service';
import { buildListScopeClause } from '@/lib/epic-alert-row-cache-query-service';
import { EPIC_SEARCH_MAX_RESULTS, isValidEpicSearchKeyword, type EpicSearchHit } from '@/lib/epic-quick-search';
import { resolveViewGrants } from '@/lib/user-view-grants-service';

/**
 * GET /api/epic-search?q=<keyword> — "Tìm nhanh Epic" (key F, owner 2026-11-11): at most 5 Epics whose key contains the
 * keyword, among the Epics of funnel layer L02 ("Epic trong phạm vi tính TTM" — in "Phạm vi dữ liệu cho TTM", not
 * Cancelled, not "Epic ngoại lệ", Rule Group with a TTM-CNTT rule; same clause as the Quản trị Epic filter
 * TTM_COUNTED_IN_SCOPE) the viewer may list (data scope + "Quyền xem"), from the row cache.
 * Order: the key typed in full first, then by the Epic's created date, newest first. The keyword is checked (letters /
 * digits / "-" only, ≤ 40) and bound as a parameter (see epic-quick-search.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const keyword = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (!isValidEpicSearchKeyword(keyword)) {
      return NextResponse.json({ error: 'Từ khoá chỉ gồm chữ cái, chữ số và dấu "-" (tối đa 40 ký tự).' }, { status: 400 });
    }
    const [scope, viewGrants] = await Promise.all([resolveAccessScope(user.id, user.role), resolveViewGrants(user.id, user.role)]);
    const params: unknown[] = [];
    const scopeClause = buildListScopeClause(scope, viewGrants, params);
    params.push(keyword.toUpperCase());
    const k = `$${params.length}`;
    params.push(EPIC_SEARCH_MAX_RESULTS);
    const limit = `$${params.length}`;
    // L02 — the TTM_COUNTED_IN_SCOPE clause of epic-alert-row-cache-query-service.ts.
    const l02 = "ttm_cntt_in_scope AND current_status !~* 'cancel' AND (row_data->>'ttmExclusion') IS NULL AND NOT (badge_codes @> ARRAY['CNTT_NO_RULE'])";
    const result = await pool.query<EpicSearchHit>(`
      SELECT c.epic_key AS "epicKey", c.epic_name AS "epicName", c.current_status AS "status", created.at::date::text AS "createdDate"
      FROM epic_alert_row_cache c
      -- Created date of the Epic: its newest version in issues (index issue_key, aggregated_at), only for the matches.
      LEFT JOIN LATERAL (
        SELECT i.jira_created_at AS at FROM issues i WHERE i.issue_key = c.epic_key ORDER BY i.aggregated_at DESC LIMIT 1
      ) created ON TRUE
      WHERE ${scopeClause} AND ${l02} AND STRPOS(UPPER(c.epic_key), ${k}) > 0
      ORDER BY (UPPER(c.epic_key) = ${k}) DESC, created.at DESC NULLS LAST, c.epic_key
      LIMIT ${limit}
    `, params);
    return NextResponse.json({ keyword, hits: result.rows });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền thực hiện thao tác này.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
    }
    console.error('Epic quick search failed', error);
    return NextResponse.json({ error: 'Không thể tìm Epic.' }, { status: 500 });
  }
}
