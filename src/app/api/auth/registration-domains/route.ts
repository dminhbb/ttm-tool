import { NextResponse } from 'next/server';
import { listDomains } from '@/lib/master-data-service';

export async function GET() {
  try {
    return NextResponse.json((await listDomains()).filter((domain) => domain.isActive).map(({ id, domainCode, domainName }) => ({ id, domainCode, domainName })));
  } catch {
    return NextResponse.json({ error: 'Không thể tải danh sách Domain.' }, { status: 500 });
  }
}
