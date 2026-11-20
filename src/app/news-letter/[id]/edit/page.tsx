'use client';

import { useParams } from 'next/navigation';
import { NewsLetterEditor } from '@/components/news-letter/NewsLetterEditor';

/** "Sửa bài viết" (SUPERADMIN — the API refuses everyone else, and another author's draft is not found); `id` is a numeric id or a slug. */
export default function NewsLetterEditPage() {
  const params = useParams<{ id: string }>();
  const articleRef = params.id;
  if (!articleRef) return <p className="py-16 text-center text-sm text-status-danger">Mã bài viết không hợp lệ.</p>;
  return <NewsLetterEditor key={articleRef} articleRef={articleRef} />;
}
