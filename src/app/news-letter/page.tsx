'use client';

import { NewsLetterReader } from '@/components/news-letter/NewsLetterReader';

/** "Bản tin": the newest published article the viewer may read. */
export default function NewsLetterPage() {
  return <NewsLetterReader articleId={null} />;
}
