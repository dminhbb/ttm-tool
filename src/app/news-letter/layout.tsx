import { NewsLetterShell } from '@/components/news-letter/NewsLetterShell';

/** "Bản tin" (route /news-letter): the contents column stays mounted while the reader moves between articles. */
export default function NewsLetterLayout({ children }: { children: React.ReactNode }) {
  return <NewsLetterShell>{children}</NewsLetterShell>;
}
