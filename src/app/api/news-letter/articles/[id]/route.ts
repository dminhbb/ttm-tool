import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { newsLetterErrorResponse, viewerOf } from '@/lib/news-letter/http';
import { articleRefToId, deleteNewsLetterArticle, getNewsLetterArticleForEdit, updateNewsLetterArticle } from '@/lib/news-letter/service';
import type { NewsLetterArticleInput } from '@/lib/news-letter/types';

/** One article in the editor — SUPERADMIN, and only an article they may see (another author's draft is "not found").
 * The `id` segment is a numeric id or a slug (owner 2026-11-20). */
type RouteContext = { params: Promise<{ id: string }> };

const BAD_ID = () => NextResponse.json({ error: 'Mã bài viết không hợp lệ.' }, { status: 400 });

async function idOf(context: RouteContext): Promise<number | null> {
  return articleRefToId((await context.params).id);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const id = await idOf(context);
    if (!id) return BAD_ID();
    return NextResponse.json({ article: await getNewsLetterArticleForEdit(viewerOf(user), id) });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể tải bài viết.');
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const id = await idOf(context);
    if (!id) return BAD_ID();
    const body = (await request.json().catch(() => ({}))) as NewsLetterArticleInput;
    return NextResponse.json(await updateNewsLetterArticle(viewerOf(user), id, body));
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể lưu bài viết.');
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const id = await idOf(context);
    if (!id) return BAD_ID();
    await deleteNewsLetterArticle(viewerOf(user), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return newsLetterErrorResponse(error, 'Không thể xoá bài viết.');
  }
}
