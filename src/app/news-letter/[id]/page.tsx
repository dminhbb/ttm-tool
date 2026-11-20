'use client';

import { useParams } from 'next/navigation';
import { NewsLetterReader } from '@/components/news-letter/NewsLetterReader';

/** One article of "Bản tin" — a link that can be shared; `id` is a numeric id or a slug (the server checks who may read it). */
export default function NewsLetterArticlePage() {
  const params = useParams<{ id: string }>();
  const articleRef = params.id;
  if (!articleRef) return <p className="py-16 text-center text-sm text-status-danger">Mã bài viết không hợp lệ.</p>;
  return <NewsLetterReader key={articleRef} articleRef={articleRef} />;
}
