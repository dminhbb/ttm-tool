'use client';

import { useParams } from 'next/navigation';
import { NewsLetterReader } from '@/components/news-letter/NewsLetterReader';

/** One article of "Bản tin" — a link that can be shared (the server still checks who may read it). */
export default function NewsLetterArticlePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return <p className="py-16 text-center text-sm text-status-danger">Mã bài viết không hợp lệ.</p>;
  return <NewsLetterReader key={id} articleId={id} />;
}
