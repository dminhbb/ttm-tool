import { NextRequest, NextResponse } from 'next/server';
import { createDomain, deleteDomain, listDomains, updateDomain } from '@/lib/master-data-service';
import type { DomainInput } from '@/lib/master-data-types';

export async function GET() {
  try {
    const domains = await listDomains();
    return NextResponse.json(domains);
  } catch (error: unknown) {
    console.error('API Error in domains route:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tải danh sách Domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DomainInput;
    if (!body.domainCode || !body.domainName) {
      return NextResponse.json({ error: 'Domain Code và Tên Domain là bắt buộc' }, { status: 400 });
    }
    const domain = await createDomain(body);
    return NextResponse.json(domain, { status: 201 });
  } catch (error: unknown) {
    console.error('API Error creating domain:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi tạo Domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as DomainInput & { id: number };
    if (!body.id || !body.domainCode || !body.domainName) {
      return NextResponse.json({ error: 'Thiếu dữ liệu bắt buộc' }, { status: 400 });
    }
    const domain = await updateDomain(body.id, body);
    return NextResponse.json(domain);
  } catch (error: unknown) {
    console.error('API Error updating domain:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi cập nhật Domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const idStr = url.searchParams.get('id');
    const id = idStr ? parseInt(idStr) : NaN;
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: 'Domain ID không hợp lệ' }, { status: 400 });
    }
    await deleteDomain(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('API Error deleting domain:', error);
    const message = error instanceof Error ? error.message : 'Lỗi hệ thống khi xóa Domain';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
