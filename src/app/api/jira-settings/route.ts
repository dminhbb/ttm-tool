import { NextRequest, NextResponse } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth-service';
import { getJiraSettings, updateJiraSettings } from '@/lib/jira-settings-service';

const MAX_URL_LENGTH = 500;

function authError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Chỉ ADMIN/SUPERADMIN được cấu hình Jira.' : 'Chưa đăng nhập.' }, { status: error.code === 'FORBIDDEN' ? 403 : 401 });
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidUrlOrEmpty(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return false;
  if (value.trim().length === 0) return true;
  try { const url = new URL(value.trim()); return url.protocol === 'http:' || url.protocol === 'https:'; }
  catch { return false; }
}

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return NextResponse.json(await getJiraSettings());
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error loading Jira settings:', error);
    return NextResponse.json({ error: 'Không thể tải cấu hình Jira.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireUser(request, ['ADMIN', 'SUPERADMIN']);
    const body: unknown = await request.json();
    if (!isRecord(body) || !isValidUrlOrEmpty(body.apiBaseUrl) || !isValidUrlOrEmpty(body.viewIssueBaseUrl)) {
      return NextResponse.json({ error: 'Địa chỉ Jira API hoặc Jira View Issue không hợp lệ.' }, { status: 400 });
    }
    return NextResponse.json(await updateJiraSettings({ apiBaseUrl: body.apiBaseUrl.trim(), viewIssueBaseUrl: body.viewIssueBaseUrl.trim() }));
  } catch (error: unknown) {
    const response = authError(error); if (response) return response;
    console.error('API Error saving Jira settings:', error);
    return NextResponse.json({ error: 'Không thể lưu cấu hình Jira.' }, { status: 500 });
  }
}
