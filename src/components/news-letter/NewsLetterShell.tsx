'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretDown, CaretRight, EyeSlash, Folder, FolderOpen, PlusCircle, Rss } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { formatNewsDate } from '@/components/news-letter/format';
import { NewsLetterPinnedTicker } from '@/components/news-letter/NewsLetterPinnedTicker';
import { newsLetterDisplayTitle } from '@/lib/news-letter/slug';
import {
  NEWS_LETTER_CHANGED_EVENT,
  NEWS_LETTER_GROUP_PAGE,
  NEWS_LETTER_LATEST_PAGE,
  NEWS_LETTER_ROUTE,
  newsArticleHref,
  type NewsLetterTocGroup,
  type NewsLetterTocItem,
  type NewsLetterTocPayload,
} from '@/lib/news-letter/types';

/**
 * Layout of "Bản tin" (owner 2026-11-06): the contents column on the left — POST (SUPERADMIN), "Mới nhất" (the 5 newest)
 * and "THƯ MỤC BÀI VIẾT": one folder per category with its articles under a line drawn from the folder (5 newest, "...."
 * for 5 more; the folder of the article on screen has its line in the theme accent, 2px — the others grey, 1px) — and
 * the page on the right. The column lives in the layout so what "...." loaded stays while the reader moves between
 * articles. The editor pages take the full width.
 * 2026-11-10: the pinned articles ("Ghim bài viết") are listed at the very top of the column, above "Mới nhất", each with a
 * pin (they stay in their folders too) and run in a ticker above the article; an article "Ẩn trên menu" reaches the column
 * only for SUPERADMIN, marked with a crossed eye.
 */

/** The article shown on the right: highlighted in the contents, its folder's line in the accent colour. */
export interface NewsLetterActiveArticle {
  id: number;
  categoryId: number | null;
}

interface NewsLetterContextValue {
  activeArticle: NewsLetterActiveArticle | null;
  setActiveArticle: (article: NewsLetterActiveArticle | null) => void;
  canPost: boolean;
}

const NewsLetterContext = React.createContext<NewsLetterContextValue>({ activeArticle: null, setActiveArticle: () => undefined, canPost: false });

export function useNewsLetter(): NewsLetterContextValue {
  return React.useContext(NewsLetterContext);
}

/** Tells the contents column (and the menu dot) that articles changed — after a save or a delete. */
export function notifyNewsLetterChanged(): void {
  window.dispatchEvent(new Event(NEWS_LETTER_CHANGED_EVENT));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

function TocLine({ active, item }: { active: boolean; item: NewsLetterTocItem }) {
  return (
    <li>
      <Link
        href={newsArticleHref(item)}
        aria-current={active ? 'page' : undefined}
        className={cn('block rounded-md py-1.5 pl-2 pr-2 transition-colors hover:bg-fb-control', active && 'bg-fb-blue-soft')}
      >
        <span className={cn('block text-[13px] font-medium leading-snug', active ? 'font-semibold text-fb-blue' : 'text-fb-text-primary')}>
          {item.hiddenFromMenu && (
            <span className="mr-1.5 inline-flex items-center gap-0.5 rounded bg-fb-surface-muted px-1.5 py-0.5 align-middle text-[11px] font-bold text-fb-text-secondary" title="Ẩn trên menu — người dùng khác chỉ mở được qua link">
              <EyeSlash className="size-3" weight="bold" aria-hidden="true" />Ẩn
            </span>
          )}
          {newsLetterDisplayTitle(item)}
          {item.isDraft && <span className="ml-1.5 rounded bg-status-warning-soft px-1.5 py-0.5 align-middle text-[11px] font-bold text-status-warning">Nháp</span>}
        </span>
        <span className="mt-0.5 block text-[11px] text-fb-text-secondary">{formatNewsDate(item.createdAt)} · {item.authorName || '—'}</span>
      </Link>
    </li>
  );
}

/** A line of "Mới nhất" (owner 2026-11-20): only the title, regular weight, with a vertical bar — no date/author. */
function LatestLine({ active, item }: { active: boolean; item: NewsLetterTocItem }) {
  return (
    <li>
      <Link
        href={newsArticleHref(item)}
        aria-current={active ? 'page' : undefined}
        className={cn('block rounded-md px-2 py-1.5 transition-colors hover:bg-fb-control', active && 'bg-fb-blue-soft')}
      >
        <span className={cn('block text-[13px] leading-snug', active ? 'font-semibold text-fb-blue' : 'font-normal text-fb-text-primary')}>
          {item.hiddenFromMenu && <EyeSlash className="mr-1 inline size-3.5 align-[-2px] text-fb-text-secondary" weight="bold" aria-label="Ẩn trên menu" />}
          {newsLetterDisplayTitle(item)}
        </span>
      </Link>
    </li>
  );
}

function TocFolder({ activeArticle, group, onLoadMore }: { activeArticle: NewsLetterActiveArticle | null; group: NewsLetterTocGroup; onLoadMore: () => Promise<void> }) {
  const [loading, setLoading] = React.useState(false);
  // Default open/collapsed follows the admin's "Expand" checkbox; the reader may still toggle it (owner 2026-11-20).
  const [open, setOpen] = React.useState(Boolean(group.expanded));
  const current = activeArticle !== null && activeArticle.categoryId === group.categoryId;
  const FolderIcon = open ? FolderOpen : Folder;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm font-bold text-fb-text-primary transition-colors hover:bg-fb-control"
      >
        {open ? <CaretDown className="size-4 shrink-0 text-fb-text-secondary" weight="bold" aria-hidden="true" /> : <CaretRight className="size-4 shrink-0 text-fb-text-secondary" weight="bold" aria-hidden="true" />}
        <FolderIcon className={cn('size-5 shrink-0', current ? 'text-fb-blue' : 'text-fb-text-secondary')} weight="fill" aria-hidden="true" />
        <span className={cn('min-w-0 flex-1 leading-snug', current && 'text-fb-blue')}>{group.name}</span>
        <span className="rounded-full bg-fb-surface-muted px-1.5 text-[11px] font-semibold text-fb-text-secondary">{group.total}</span>
      </button>
      {open && (
        /* The line from the folder down to its articles: accent 2px for the folder on screen, grey 1px otherwise. */
        <div className={cn('ml-[17px] pl-2', current ? 'border-l-2 border-fb-blue' : 'border-l border-fb-border')}>
          <ul>
            {group.items.map((item) => <TocLine key={item.id} item={item} active={item.id === activeArticle?.id} />)}
          </ul>
          {group.items.length < group.total && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void onLoadMore().finally(() => setLoading(false));
              }}
              className="px-2 text-sm font-bold tracking-widest text-fb-text-secondary hover:text-fb-blue disabled:opacity-50"
              title={`Hiện thêm ${Math.min(NEWS_LETTER_GROUP_PAGE, group.total - group.items.length)} bài viết của thư mục ${group.name}`}
              aria-label={`Hiện thêm bài viết của thư mục ${group.name}`}
            >
              ....
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TocColumn({ activeArticle, canPost, onLoadMoreGroup, payload }: {
  activeArticle: NewsLetterActiveArticle | null;
  canPost: boolean;
  payload: NewsLetterTocPayload | null;
  onLoadMoreGroup: (group: NewsLetterTocGroup) => Promise<void>;
}) {
  const toc = payload?.toc ?? null;
  return (
    <nav aria-label="Mục lục Bản tin" className="space-y-5">
      {canPost && (
        <Link href={`${NEWS_LETTER_ROUTE}/new`} className="ui-button ui-button-primary w-full justify-center">
          <PlusCircle className="size-4" weight="bold" aria-hidden="true" />
          POST
        </Link>
      )}
      <section>
        <h2 className="flex items-center gap-1.5 border-b border-fb-border px-2 pb-1.5 text-xs font-bold uppercase tracking-wider text-fb-text-secondary">
          <Rss className="size-3.5" weight="bold" aria-hidden="true" /> Mới nhất
        </h2>
        {!toc ? (
          <p className="px-2 py-2 text-xs text-fb-text-secondary">Đang tải…</p>
        ) : toc.latest.length === 0 ? (
          <p className="px-2 py-2 text-xs text-fb-text-secondary">Chưa có bài viết.</p>
        ) : (
          /* "Mới nhất": chỉ tiêu đề, font thường, thanh dọc kéo dài như Thư mục (owner 2026-11-20). */
          <div className="mt-1 border-l border-fb-border pl-2">
            <ul>{toc.latest.slice(0, NEWS_LETTER_LATEST_PAGE).map((item) => <LatestLine key={item.id} item={item} active={item.id === activeArticle?.id} />)}</ul>
          </div>
        )}
      </section>
      {toc && toc.groups.length > 0 && (
        <section>
          <h2 className="border-b border-fb-border px-2 pb-1.5 text-xs font-bold uppercase tracking-wider text-fb-text-secondary">Thư mục bài viết</h2>
          <div className="mt-2 space-y-3">
            {toc.groups.map((group) => (
              <TocFolder key={group.categoryId ?? 'none'} group={group} activeArticle={activeArticle} onLoadMore={() => onLoadMoreGroup(group)} />
            ))}
          </div>
        </section>
      )}
    </nav>
  );
}

export function NewsLetterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [payload, setPayload] = React.useState<NewsLetterTocPayload | null>(null);
  const [activeArticle, setActiveArticle] = React.useState<NewsLetterActiveArticle | null>(null);
  const isEditor = pathname === `${NEWS_LETTER_ROUTE}/new` || pathname.endsWith('/edit');

  React.useEffect(() => {
    let active = true;
    const load = () => {
      void fetchJson<NewsLetterTocPayload>('/api/news-letter/toc').then((data) => {
        if (active && data) setPayload(data);
      });
    };
    load();
    window.addEventListener(NEWS_LETTER_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(NEWS_LETTER_CHANGED_EVENT, load);
    };
  }, []);

  const appendGroup = React.useCallback(async (group: NewsLetterTocGroup) => {
    const key = group.categoryId ?? 'none';
    const data = await fetchJson<{ items: NewsLetterTocItem[] }>(`/api/news-letter/toc?categoryId=${key}&offset=${group.items.length}`);
    if (!data) return;
    setPayload((prev) => (prev ? {
      ...prev,
      toc: {
        ...prev.toc,
        groups: prev.toc.groups.map((item) => (item.categoryId === group.categoryId ? { ...item, items: [...item.items, ...data.items.filter((line) => !item.items.some((old) => old.id === line.id))] } : item)),
      },
    } : prev));
  }, []);

  const context = React.useMemo<NewsLetterContextValue>(() => ({ activeArticle, setActiveArticle, canPost: Boolean(payload?.canPost) }), [activeArticle, payload?.canPost]);

  return (
    <NewsLetterContext.Provider value={context}>
      {isEditor ? children : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_338px]">
          {/* Cột menu (Mới nhất + Thư mục bài viết) nằm bên phải (owner 2026-11-20). */}
          <aside className="order-2 lg:order-2 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto">
            <TocColumn payload={payload} canPost={Boolean(payload?.canPost)} activeArticle={activeArticle} onLoadMoreGroup={appendGroup} />
          </aside>
          <div className="order-1 min-w-0 lg:order-1">
            {/* Ticker of the pinned articles, at the top of the article area (owner 2026-11-10). */}
            {(payload?.toc.pinned.length ?? 0) > 0 && (
              <div className="mx-auto w-full max-w-[1075px]"><NewsLetterPinnedTicker items={payload?.toc.pinned ?? []} /></div>
            )}
            {children}
          </div>
        </div>
      )}
    </NewsLetterContext.Provider>
  );
}
