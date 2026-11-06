import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, positiveInt, viewerOf } from '@/lib/news-letter/http';
import { deleteNewsLetterCategory, listNewsLetterCategories, renameNewsLetterCategory } from '@/lib/news-letter/service';

type RouteContext = { params: Promise<{ id: string }> };
const BAD_ID = () => NextResponse.json({ error: 'Mã phân loại không hợp lệ.' }, { status: 400 });

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const id = positiveInt((await context.params).id);
    if (!id) return BAD_ID();
    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    await renameNewsLetterCategory(viewerOf(user), id, body.name);
    return NextResponse.json({ categories: await listNewsLetterCategories() });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể sửa phân loại.');
  }
}

/** Refused (409) while articles use the category. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const id = positiveInt((await context.params).id);
    if (!id) return BAD_ID();
    await deleteNewsLetterCategory(viewerOf(user), id);
    return NextResponse.json({ categories: await listNewsLetterCategories() });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể xoá phân loại.');
  }
}
