import { NextRequest, NextResponse } from 'next/server';
import { createProject, deleteProject, listProjects, updateProject } from '@/lib/master-data-service';
import type { ProjectInput } from '@/lib/master-data-types';

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (error: unknown) {
    console.error('API Error in projects route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Dự án';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProjectInput;
    if (!body.projectKey || !body.projectName || !body.sourceProjectKey) {
      return NextResponse.json({ error: 'Project Key, Tên dự án và Source Project Key là bắt buộc' }, { status: 400 });
    }
    const project = await createProject(body);
    return NextResponse.json(project, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating project:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Dự án';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as ProjectInput & { id: number };
    if (!body.id || !body.projectKey || !body.projectName || !body.sourceProjectKey) {
      return NextResponse.json({ error: 'Thiếu dữ liệu bắt buộc' }, { status: 400 });
    }
    const project = await updateProject(body.id, body);
    return NextResponse.json(project);
  } catch (error: unknown) {
    console.error('API Error updating project:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Dự án';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const idStr = url.searchParams.get('id');
    const id = idStr ? parseInt(idStr) : NaN;
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Project ID không hợp lệ' }, { status: 400 });
    }
    await deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting project:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Dự án';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
