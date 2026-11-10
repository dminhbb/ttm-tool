'use client';

import Link from 'next/link';
import { Play, PushPin } from '@phosphor-icons/react';
import { useTickerRotation } from '@/components/ui/useTickerRotation';
import { NEWS_LETTER_ROUTE, type NewsLetterTocItem } from '@/lib/news-letter/types';

/**
 * Ticker of the pinned articles of "Bản tin" (owner 2026-11-10), at the top of the article area: the same one-line ticker as
 * TTM Dashboard 2 (useTickerRotation — each title grows up from below, 3 s each, the pin is the play / pause switch), each
 * title a link to its article.
 */
export function NewsLetterPinnedTicker({ items }: { items: readonly NewsLetterTocItem[] }) {
  const { index, itemStyle, playing, togglePlaying } = useTickerRotation(items.length);
  if (items.length === 0) return null;
  const item = items[index % items.length];
  return (
    <div
      aria-label={`Bài viết ghim: ${items.map((entry) => entry.title).join(' · ')}`}
      className="mb-6 flex min-w-0 items-center gap-2 rounded-lg border border-fb-border bg-fb-surface px-2 py-1.5 text-sm text-fb-text-primary"
      role="region"
    >
      <button
        aria-label={playing ? 'Dừng dòng bài viết ghim' : 'Tiếp tục dòng bài viết ghim'}
        aria-pressed={!playing}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--color-text-brand)] outline-none transition-colors hover:bg-fb-control focus-visible:ring-2 focus-visible:ring-fb-blue"
        onClick={togglePlaying}
        title={playing ? 'Bấm để dừng' : 'Bấm để chạy tiếp'}
        type="button"
      >
        {playing ? <PushPin aria-hidden="true" className="size-4" weight="fill" /> : <Play aria-hidden="true" className="size-4" weight="fill" />}
      </button>
      <span className="shrink-0 whitespace-nowrap font-bold">Bài viết ghim:</span>
      <span aria-hidden="true" className="relative block h-5 min-w-0 flex-1 overflow-hidden">
        <Link
          className="absolute inset-x-0 top-0 block origin-bottom truncate leading-5 text-fb-text-primary hover:text-fb-blue hover:underline"
          href={`${NEWS_LETTER_ROUTE}/${item.id}`}
          key={index}
          style={itemStyle}
          tabIndex={-1}
          title={item.title}
        >
          {item.title}
        </Link>
      </span>
      {items.length > 1 && (
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-fb-text-placeholder">{(index % items.length) + 1}/{items.length}</span>
      )}
    </div>
  );
}
