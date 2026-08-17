import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { parseCSV } from '@/lib/csv-parser';
import { getClient } from '@/lib/db';
import { createProject, deleteProject, listProjects, updateProject } from '@/lib/master-data-service';
import { PROJECT_CATEGORIES } from '@/lib/master-data-types';
import type { ProjectCategory, ProjectInput, TtmOption } from '@/lib/master-data-types';

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
type CsvProject = { leadName: string; projectCategory: ProjectCategory | null; projectKey: string; projectName: string; sourceProjectKey: string; ttm: TtmOption };

function authError(error: unknown): NextResponse | null { if (error instanceof AuthError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Bạn không có quyền quản lý dự án.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 }); return null; }
function isProjectInput(value: unknown): value is ProjectInput { if (typeof value !== 'object' || value === null) return false; const input = value as Record<string, unknown>; return typeof input.projectKey === 'string' && typeof input.projectName === 'string' && typeof input.sourceProjectKey === 'string' && typeof input.sourceType === 'string' && typeof input.leadName === 'string' && typeof input.isActive === 'boolean' && (input.ttm === 'Y' || input.ttm === 'N') && (input.projectCategory === null || (typeof input.projectCategory === 'string' && PROJECT_CATEGORIES.includes(input.projectCategory as ProjectCategory))) && (input.domainId === null || (Number.isInteger(input.domainId) && (input.domainId as number) > 0)); }
function normalizeHeader(value: string): string { return value.trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' '); }
function validCategory(value: string): ProjectCategory | null { return PROJECT_CATEGORIES.includes(value as ProjectCategory) ? value as ProjectCategory : null; }
function validateProjectInput(input: ProjectInput): string | null { if (!input.projectKey.trim() || !input.projectName.trim() || !input.sourceProjectKey.trim()) return 'Mã hiển thị, Tên dự án và Source Project Key (Jira) là bắt buộc.'; if (input.projectKey.trim().length > 50 || input.projectName.trim().length > 255 || input.sourceProjectKey.trim().length > 50 || input.leadName.trim().length > 255) return 'Thông tin dự án vượt quá độ dài cho phép.'; return null; }
async function assertActiveUserName(name: string): Promise<boolean> { const client = await getClient(); try { const result = await client.query('SELECT id FROM users WHERE (full_name = $1 OR email = $1) AND is_active = TRUE', [name]); return result.rowCount === 1; } finally { client.release(); } }

export async function GET(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); return NextResponse.json(await listProjects()); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể tải danh sách dự án.' }, { status: 500 }); } }
export async function POST(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const input: unknown = await request.json(); if (!isProjectInput(input)) return NextResponse.json({ error: 'Dữ liệu dự án không hợp lệ.' }, { status: 400 }); const error = validateProjectInput(input); if (error) return NextResponse.json({ error }, { status: 400 }); if (input.leadName && !await assertActiveUserName(input.leadName.trim())) return NextResponse.json({ error: 'PM/SM phải thuộc danh sách user đang active.' }, { status: 400 }); return NextResponse.json(await createProject({ ...input, projectKey: input.projectKey.trim(), projectName: input.projectName.trim(), sourceProjectKey: input.sourceProjectKey.trim(), leadName: input.leadName.trim() }), { status: 201 }); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể tạo dự án.' }, { status: 500 }); } }
export async function PUT(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const input: unknown = await request.json(); if (!isProjectInput(input) || !('id' in input) || !Number.isInteger(input.id) || (input.id as number) <= 0) return NextResponse.json({ error: 'Dữ liệu dự án không hợp lệ.' }, { status: 400 }); const project = input as ProjectInput & { id: number }; const error = validateProjectInput(project); if (error) return NextResponse.json({ error }, { status: 400 }); if (project.leadName && !await assertActiveUserName(project.leadName.trim())) return NextResponse.json({ error: 'PM/SM phải thuộc danh sách user đang active.' }, { status: 400 }); return NextResponse.json(await updateProject(project.id, { ...project, projectKey: project.projectKey.trim(), projectName: project.projectName.trim(), sourceProjectKey: project.sourceProjectKey.trim(), leadName: project.leadName.trim() })); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể cập nhật dự án.' }, { status: 500 }); } }
export async function DELETE(request: NextRequest) { try { await requireUser(request, ['ADMIN', 'SUPERADMIN']); const id = Number(new URL(request.url).searchParams.get('id')); if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Project ID không hợp lệ.' }, { status: 400 }); await deleteProject(id); return NextResponse.json({ success: true }); } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể xóa dự án.' }, { status: 500 }); } }

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
    const projects: CsvProject[] = rows.slice(1).map((row) => { const key = (row[keyIndex] ?? '').trim(); const ttm = (row[ttmIndex] ?? '').trim().toUpperCase(); return { projectName: (row[projectNameIndex] ?? '').trim(), projectCategory: categoryIndex >= 0 ? validCategory((row[categoryIndex] ?? '').trim()) : null, leadName: leadIndex >= 0 ? (row[leadIndex] ?? '').trim() : '', projectKey: key, sourceProjectKey: key, ttm: ttm as TtmOption }; });
    const invalidRows = projects.map((project, index) => ({ project, rowNumber: index + 2 })).filter(({ project }) => !project.projectName || !project.sourceProjectKey || !['Y', 'N'].includes(project.ttm) || project.projectName.length > 255 || project.sourceProjectKey.length > 50);
    if (invalidRows.length) return NextResponse.json({ error: `Tên dự án, Key hoặc Time to Market không hợp lệ tại dòng ${invalidRows.map(({ rowNumber }) => rowNumber).join(', ')}.` }, { status: 400 });
    const keys = projects.map((project) => project.projectKey);
    if (new Set(keys).size !== keys.length) return NextResponse.json({ error: 'Key bị trùng trong file CSV.' }, { status: 400 });
    let unresolvedLeadCount = 0;
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const leadInputs = Array.from(new Set(projects.map((project) => project.leadName).filter(Boolean)));
      const users = await client.query<{ email: string; fullName: string; id: number }>('SELECT id, email, full_name AS "fullName" FROM users WHERE is_active = TRUE AND (full_name = ANY($1::text[]) OR email = ANY($1::text[]))', [leadInputs]);
      const nameByInput = new Map<string, string>(); for (const user of users.rows) { nameByInput.set(user.fullName, user.fullName); nameByInput.set(user.email, user.fullName); }
      const userIdByFullName = new Map(users.rows.map((user) => [user.fullName, user.id]));
      unresolvedLeadCount = projects.filter((project) => project.leadName && !nameByInput.has(project.leadName)).length;
      const existing = await client.query<{ projectKey: string }>('SELECT project_key AS "projectKey" FROM projects WHERE project_key = ANY($1::text[])', [keys]);
      if (existing.rowCount) { await client.query('ROLLBACK'); return NextResponse.json({ error: `Mã hiển thị đã tồn tại: ${existing.rows.map((project) => project.projectKey).join(', ')}.` }, { status: 409 }); }
      for (const project of projects) {
        const leadName = nameByInput.get(project.leadName) ?? null;
        const createdProject = await client.query<{ id: number }>('INSERT INTO projects (project_key, project_name, domain_id, source_project_key, source_type, project_category, ttm, lead_name, is_active) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, TRUE) RETURNING id', [project.projectKey, project.projectName, project.sourceProjectKey, 'JIRA', project.projectCategory, project.ttm, leadName]);
        const userId = leadName ? userIdByFullName.get(leadName) : undefined;
        if (userId) await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [userId, createdProject.rows[0].id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return NextResponse.json({ success: true, imported: projects.length, unresolvedLeadCount }, { status: 201 });
  } catch (error) { return authError(error) ?? NextResponse.json({ error: 'Không thể import danh sách dự án.' }, { status: 500 }); }
}
