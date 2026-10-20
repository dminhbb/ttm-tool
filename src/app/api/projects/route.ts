import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { parseCSV } from '@/lib/csv-parser';
import { scheduleDerivedCacheRefresh } from '@/lib/daily-cache-service';
import pool, { getClient } from '@/lib/db';
import { createProject, deleteProject, listProjects, updateProject } from '@/lib/master-data-service';
import { PROJECT_CATEGORIES } from '@/lib/master-data-types';
import type { ProjectCategory, ProjectInput, TtmOption } from '@/lib/master-data-types';
import { extractUsername } from '@/lib/username';

// A project's "Time to Market" flag decides whether its Epics count from L02 of the TTM Dashboard 2
// funnel on (N = left out, see TtmExclusion in scoring/types.ts), so a change to it rebuilds the
// derived caches in after() — past the response — like a black list save does. So does a change to
// anything else the cached Epic rows carry from an ACTIVE project, matched by its key: domainName
// (getDomainByProjectKeyMap), projectName and the PM/SM names (getProjectMetaByProjectKeyMap) — the
// Domain / project / PM-SM filters, matrices and pie charts are all read from those. (PM/SM
// assignment itself is saved on the Users screen — see api/users.)
export const maxDuration = 300;
type CachedProjectFields = Pick<ProjectInput, 'domainId' | 'isActive' | 'projectName' | 'sourceProjectKey'> & { ttm: string };
async function storedProject(id: number): Promise<CachedProjectFields | null> { const result = await pool.query<CachedProjectFields>('SELECT source_project_key AS "sourceProjectKey", project_name AS "projectName", ttm, domain_id AS "domainId", is_active AS "isActive" FROM projects WHERE id = $1', [id]); return result.rows[0] ?? null; }
/** What the derived caches hold about a project's Epics, as one comparable string — '' when nothing:
 * an inactive project names no Epic, only its Time to Market = N still counts (loadTtmExclusionSources
 * reads every project). A save needs a rebuild exactly when this differs before and after. */
function cacheFootprint(project: CachedProjectFields | null): string {
  if (!project || (!project.isActive && project.ttm !== 'N')) return '';
  return JSON.stringify([project.sourceProjectKey.trim(), project.ttm, ...(project.isActive ? [project.projectName.trim(), project.domainId] : [])]);
}

// A project's Jira key never changes (owner rule 2026-10-20): a Jira project that changes its key is
// created here as a NEW project, so the edit form locks the field and the API refuses the change.
const KEY_CHANGE_ERROR = 'Không thể đổi Project Key (Jira) của dự án đã tạo. Dự án Jira đổi key cần được tạo thành dự án mới.';

/** Same comparison for a typed full name as for the stored one: NFC, trimmed, single spaces, lower case. */
function normalizeFullName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

/**
 * The CSV's PM-SM cell → an active user: by username or email first (the local part of the email —
 * see username.ts), else by full name when exactly ONE active user has it (2026-10-20 — the bulk
 * import accepted full names before 2026-10-19, and files written that way must keep working).
 * Ambiguous or unknown → null (counted in unresolvedLeadCount; the project is created without PM/SM).
 */
function buildLeadResolver(users: readonly { fullName: string; id: number; username: string }[]): (cell: string) => number | null {
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  const byFullName = new Map<string, number[]>();
  for (const user of users) {
    const key = normalizeFullName(user.fullName);
    if (key) byFullName.set(key, [...(byFullName.get(key) ?? []), user.id]);
  }
  return (cell) => {
    if (!cell.trim()) return null;
    const byName = byFullName.get(normalizeFullName(cell)) ?? [];
    return byUsername.get(extractUsername(cell)) ?? (byName.length === 1 ? byName[0] : null);
  };
}

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
type CsvProject = { leadName: string; projectCategory: ProjectCategory | null; projectName: string; sourceProjectKey: string; ttm: TtmOption };

function authError(error: unknown): NextResponse | null { if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý dự án.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 }); return null; }
function isProjectInput(value: unknown): value is ProjectInput { if (typeof value !== 'object' || value === null) return false; const input = value as Record<string, unknown>; return typeof input.projectName === 'string' && typeof input.sourceProjectKey === 'string' && typeof input.sourceType === 'string' && typeof input.isActive === 'boolean' && (input.ttm === 'Y' || input.ttm === 'N') && (input.projectCategory === null || (typeof input.projectCategory === 'string' && PROJECT_CATEGORIES.includes(input.projectCategory as ProjectCategory))) && (input.domainId === null || (Number.isInteger(input.domainId) && (input.domainId as number) > 0)); }
function normalizeHeader(value: string): string { return value.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' '); }
function validCategory(value: string): ProjectCategory | null { return PROJECT_CATEGORIES.includes(value as ProjectCategory) ? value as ProjectCategory : null; }
function validateProjectInput(input: ProjectInput): string | null { if (!input.projectName.trim() || !input.sourceProjectKey.trim()) return 'Tên dự án và Project Key (Jira) là bắt buộc.'; if (input.projectName.trim().length > 255 || input.sourceProjectKey.trim().length > 50) return 'Thông tin dự án vượt quá độ dài cho phép.'; return null; }

export async function GET(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN', 'SUPERVISOR']); return NextResponse.json(await listProjects()); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể tải danh sách dự án.' }, { status: 500 }); } }
export async function POST(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const input: unknown = await request.json(); if (!isProjectInput(input)) return NextResponse.json({ error: 'Dữ liệu dự án không hợp lệ.' }, { status: 400 }); const error = validateProjectInput(input); if (error) return NextResponse.json({ error }, { status: 400 }); const created = await createProject({ ...input, projectName: input.projectName.trim(), sourceProjectKey: input.sourceProjectKey.trim() }); if (cacheFootprint(input)) scheduleDerivedCacheRefresh('projects'); return NextResponse.json(created, { status: 201 }); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể tạo dự án.' }, { status: 500 }); } }
export async function PUT(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const input: unknown = await request.json(); if (!isProjectInput(input) || !('id' in input) || !Number.isInteger(input.id) || (input.id as number) <= 0) return NextResponse.json({ error: 'Dữ liệu dự án không hợp lệ.' }, { status: 400 }); const project = input as ProjectInput & { id: number }; const error = validateProjectInput(project); if (error) return NextResponse.json({ error }, { status: 400 }); const previous = await storedProject(project.id); if (previous && previous.sourceProjectKey.trim() !== project.sourceProjectKey.trim()) return NextResponse.json({ error: KEY_CHANGE_ERROR }, { status: 400 }); const updated = await updateProject(project.id, { ...project, projectName: project.projectName.trim(), sourceProjectKey: project.sourceProjectKey.trim() }); if (previous && cacheFootprint(previous) !== cacheFootprint(project)) scheduleDerivedCacheRefresh('projects'); return NextResponse.json(updated); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể cập nhật dự án.' }, { status: 500 }); } }
export async function DELETE(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const id = Number(new URL(request.url).searchParams.get('id')); if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Project ID không hợp lệ.' }, { status: 400 }); const previous = await storedProject(id); await deleteProject(id); if (cacheFootprint(previous)) scheduleDerivedCacheRefresh('projects'); return NextResponse.json({ success: true }); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể xóa dự án.' }, { status: 500 }); } }

export async function PATCH(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const formData = await request.formData(); const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_CSV_BYTES || (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv')) return NextResponse.json({ error: 'Chỉ chấp nhận file CSV tối đa 1 MB.' }, { status: 400 });
    const rows = parseCSV(await file.text());
    if (rows.length < 2 || rows.length - 1 > MAX_IMPORT_ROWS) return NextResponse.json({ error: `File CSV phải có từ 1 đến ${MAX_IMPORT_ROWS} dòng dữ liệu.` }, { status: 400 });
    const headers = rows[0].map(normalizeHeader);
    const projectNameIndex = headers.findIndex((header) => header === 'tên dự án' || header === 'ten du an');
    const categoryIndex = headers.findIndex((header) => header === 'loại hình dự án' || header === 'loai hinh du an');
    const leadIndex = headers.findIndex((header) => header === 'pm-sm' || header === 'pm/sm');
    const keyIndex = headers.findIndex((header) => header === 'key');
    const ttmIndex = headers.findIndex((header) => header === 'ttm' || header === 'time to market');
    if (projectNameIndex < 0 || keyIndex < 0 || ttmIndex < 0) return NextResponse.json({ error: 'CSV bắt buộc có cột Tên dự án, Key và TTM.' }, { status: 400 });
    const projects: CsvProject[] = rows.slice(1).map((row) => { const key = (row[keyIndex] ?? '').trim(); const ttm = (row[ttmIndex] ?? '').trim().toUpperCase(); return { projectName: (row[projectNameIndex] ?? '').trim(), projectCategory: categoryIndex >= 0 ? validCategory((row[categoryIndex] ?? '').trim()) : null, leadName: leadIndex >= 0 ? (row[leadIndex] ?? '').trim() : '', sourceProjectKey: key, ttm: ttm as TtmOption }; });
    const invalidRows = projects.map((project, index) => ({ project, rowNumber: index + 2 })).filter(({ project }) => !project.projectName || !project.sourceProjectKey || !['Y', 'N'].includes(project.ttm) || project.projectName.length > 255 || project.sourceProjectKey.length > 50);
    if (invalidRows.length) return NextResponse.json({ error: `Tên dự án, Key hoặc Time to Market không hợp lệ tại dòng ${invalidRows.map(({ rowNumber }) => rowNumber).join(', ')}.` }, { status: 400 });
    const keys = projects.map((project) => project.sourceProjectKey);
    if (new Set(keys).size !== keys.length) return NextResponse.json({ error: 'Key bị trùng trong file CSV.' }, { status: 400 });
    let unresolvedLeadCount = 0;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      // Every active user: the full-name match is done here, not in SQL, so Vietnamese case folding is
      // the same as normalizeFullName's (a few hundred rows at most).
      const users = await client.query<{ fullName: string; id: number; username: string }>(`SELECT id, SPLIT_PART(LOWER(email), '@', 1) AS username, full_name AS "fullName" FROM users WHERE is_active = TRUE`);
      const resolveLead = buildLeadResolver(users.rows);
      unresolvedLeadCount = projects.filter((project) => project.leadName.trim() && resolveLead(project.leadName) === null).length;
      const existing = await client.query<{ sourceProjectKey: string }>('SELECT source_project_key AS "sourceProjectKey" FROM projects WHERE source_project_key = ANY($1::text[])', [keys]);
      if (existing.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: `Key đã tồn tại: ${existing.rows.map((project) => project.sourceProjectKey).join(', ')}.` }, { status: 409 }); }
      for (const project of projects) {
        const createdProject = await client.query<{ id: number }>('INSERT INTO projects (project_name, domain_id, source_project_key, source_type, project_category, ttm, is_active) VALUES ($1, NULL, $2, $3, $4, $5, TRUE) RETURNING id', [project.projectName, project.sourceProjectKey, 'JIRA', project.projectCategory, project.ttm]);
        const userId = resolveLead(project.leadName);
        if (userId) await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [userId, createdProject.rows[0].id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    // Every imported project is active, so its name / PM-SM / Time to Market flag now show on its Epics.
    scheduleDerivedCacheRefresh('projects');
    return NextResponse.json({ success: true, imported: projects.length, unresolvedLeadCount }, { status: 201 });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể import danh sách dự án.' }, { status: 500 }); }
}
