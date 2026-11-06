'use client';

import { NewsLetterEditor } from '@/components/news-letter/NewsLetterEditor';

/** "Soạn bài viết" (SUPERADMIN — the API refuses everyone else). */
export default function NewsLetterNewPage() {
  return <NewsLetterEditor articleId={null} />;
}
