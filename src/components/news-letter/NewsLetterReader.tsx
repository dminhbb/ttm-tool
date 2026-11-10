'use client';

import * as React from 'react';
import '@/app/rich-text.css';
import Link from 'next/link';
import { CalendarBlank, CaretLeft, CaretRight, Check, ClockCounterClockwise, Eye, EyeSlash, Lock, PencilSimple, PushPin, ShareNetwork, Tag, UserCircle } from '@phosphor-icons/react';
import { showToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatNewsDate, formatNewsDateTime } from '@/components/news-letter/format';
import { useNewsLetter } from '@/components/news-letter/NewsLetterShell';
import { NEWS_LETTER_READ_EVENT, NEWS_LETTER_ROLE_LABEL, NEWS_LETTER_ROUTE, NEWS_LETTER_ROLES, newsLetterImageUrl, type NewsLetterNeighbour, type NewsLetterPage } from '@/lib/news-letter/types';

/**
 * One article of "Bản tin" (owner 2026-11-06, look of the reference design 3): category with a short accent line, a big
 * title, the summary in italics, a meta line (author, date, category), the header image across the column, the body as
 * wide as the summary, "‹ Bài viết trước" / "Bài viết sau ›" above and below (greyed out when there is none
 * the viewer may read), and "Lịch sử thay đổi" in small grey type at the bottom.
 */

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; page: NewsLetterPage };

function NeighbourLink({ direction, neighbour }: { direction: 'previous' | 'next'; neighbour: NewsLetterNeighbour | null }) {
  const label = direction === 'previous' ? 'Bài viết trước' : 'Bài viết sau';
  const content = (
    <span className="inline-flex items-center gap-1 text-sm font-semibold">
      {direction === 'previous' && <CaretLeft className="size-4" weight="bold" aria-hidden="true" />}
      {label}
      {direction === 'next' && <CaretRight className="size-4" weight="bold" aria-hidden="true" />}
    </span>
  );
  if (!neighbour) {
    return <span aria-disabled="true" className="cursor-not-allowed text-fb-text-secondary opacity-40">{content}</span>;
  }
  return (
    <Tooltip content={neighbour.title} side="bottom" align={direction === 'previous' ? 'start' : 'end'} multiline className="inline-flex w-auto">
      <Link href={`${NEWS_LETTER_ROUTE}/${neighbour.id}`} className="text-fb-text-primary hover:text-fb-blue" aria-label={`${label}: ${neighbour.title}`}>
        {content}
      </Link>
    </Tooltip>
  );
}

function NeighbourRow({ page }: { page: NewsLetterPage }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <NeighbourLink direction="previous" neighbour={page.previous} />
      <NeighbourLink direction="next" neighbour={page.next} />
    </div>
  );
}

/** Copies text to the clipboard — the async API where the page is a secure context, else the old selection way. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection way.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/** "Share" under the article (owner 2026-11-10): shows the article's direct link and copies it to the clipboard. */
function ShareButton({ articleId }: { articleId: number }) {
  const [link, setLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const share = async () => {
    const url = `${window.location.origin}${NEWS_LETTER_ROUTE}/${articleId}`;
    setLink(url);
    const ok = await copyText(url);
    setCopied(ok);
    showToast(ok ? 'Đã copy link bài viết vào clipboard' : 'Không copy tự động được — hãy copy link hiển thị bên cạnh');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex items-center gap-1.5 rounded-full border border-fb-border px-3 py-1.5 text-sm font-semibold text-fb-text-primary transition-colors hover:border-fb-blue hover:text-fb-blue"
      >
        <ShareNetwork className="size-4" weight="bold" aria-hidden="true" />
        Share
      </button>
      {link && (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-fb-surface-muted px-2 py-1 text-xs text-fb-text-secondary">
          {copied && <Check className="size-3.5 shrink-0 text-status-success" weight="bold" aria-label="Đã copy" />}
          <input
            aria-label="Link trực tiếp tới bài viết"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-fb-text-primary outline-none"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            size={Math.min(60, link.length)}
            value={link}
          />
        </span>
      )}
    </div>
  );
}

export function NewsLetterReader({ articleId }: { articleId: number | null }) {
  const { setActiveArticle } = useNewsLetter();
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });

  React.useEffect(() => {
    let active = true;
    fetch(`/api/news-letter${articleId ? `?articleId=${articleId}` : ''}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as NewsLetterPage & { error?: string };
        if (!active) return;
        if (!response.ok) {
          setState({ status: 'error', message: data.error || 'Không thể tải bài viết.' });
          return;
        }
        setState({ status: 'ready', page: data });
        setActiveArticle(data.article ? { id: data.article.id, categoryId: data.article.categoryId } : null);
        // The server marked it read — the menu dot may go away.
        window.dispatchEvent(new Event(NEWS_LETTER_READ_EVENT));
      })
      .catch(() => {
        if (active) setState({ status: 'error', message: 'Không thể tải bài viết.' });
      });
    return () => {
      active = false;
    };
  }, [articleId, setActiveArticle]);

  if (state.status === 'loading') return <p className="py-16 text-center text-sm text-fb-text-secondary">Đang tải bài viết…</p>;
  if (state.status === 'error') return <p className="py-16 text-center text-sm text-status-danger">{state.message}</p>;

  const { page } = state;
  const article = page.article;
  if (!article) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-fb-text-primary">Chưa có bài viết nào.</p>
        <p className="mt-1 text-sm text-fb-text-secondary">Bài viết mới sẽ hiện ở đây khi được đăng.</p>
      </div>
    );
  }
  const restricted = article.visibleRoles.length < NEWS_LETTER_ROLES.length;

  return (
    <article className="mx-auto w-full max-w-[860px] pb-12">
      <NeighbourRow page={page} />

      <header className="mt-8">
        <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-fb-blue">
          <span className="h-px w-10 bg-fb-blue" aria-hidden="true" />
          {article.categoryName ?? 'Bản tin'}
          {!article.isPublished && <span className="rounded bg-status-warning-soft px-1.5 py-0.5 tracking-normal text-status-warning">Nháp — chỉ bạn xem được</span>}
          {article.isPinned && <span className="inline-flex items-center gap-1 rounded bg-fb-blue-soft px-1.5 py-0.5 tracking-normal"><PushPin className="size-3" weight="fill" aria-hidden="true" />Ghim</span>}
          {article.hiddenFromMenu && (
            <span className="inline-flex items-center gap-1 rounded bg-fb-surface-muted px-1.5 py-0.5 tracking-normal text-fb-text-secondary" title="Không hiện trên menu — người dùng mở qua link chia sẻ">
              <EyeSlash className="size-3" weight="bold" aria-hidden="true" />Ẩn trên menu
            </span>
          )}
        </p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <h1 className="news-title text-3xl font-bold leading-tight text-fb-text-primary sm:text-[40px]">{article.title}</h1>
          {page.canPost && (
            <Tooltip content="Sửa bài viết" side="bottom" align="end" className="inline-flex w-auto shrink-0">
              <Link href={`${NEWS_LETTER_ROUTE}/${article.id}/edit`} aria-label="Sửa bài viết" className="grid size-9 place-items-center rounded-full border border-fb-border text-fb-text-secondary transition-colors hover:border-fb-blue hover:text-fb-blue">
                <PencilSimple className="size-4" weight="bold" />
              </Link>
            </Tooltip>
          )}
        </div>
        {article.summary && <p className="news-title mt-3 text-lg italic leading-relaxed text-fb-text-secondary">{article.summary}</p>}
        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-semibold uppercase tracking-wider text-fb-text-secondary">
          <li className="inline-flex items-center gap-1.5"><UserCircle className="size-4" weight="bold" aria-hidden="true" />{article.authorName || '—'}</li>
          <li className="inline-flex items-center gap-1.5"><CalendarBlank className="size-4" weight="bold" aria-hidden="true" />{formatNewsDate(article.firstPublishedAt ?? article.createdAt)}</li>
          {article.isPublished && (
            <li className="inline-flex items-center gap-1.5"><Eye className="size-4" weight="bold" aria-hidden="true" />{new Intl.NumberFormat('vi-VN').format(article.viewCount)} lượt xem</li>
          )}
          <li className="inline-flex items-center gap-1.5"><Tag className="size-4" weight="bold" aria-hidden="true" />{article.categoryName ?? 'Chưa phân loại'}</li>
          {restricted && (
            <li className="inline-flex items-center gap-1.5 normal-case tracking-normal">
              <Lock className="size-4" weight="bold" aria-hidden="true" />
              Dành cho: {article.visibleRoles.map((role) => NEWS_LETTER_ROLE_LABEL[role] ?? role).join(', ')}
            </li>
          )}
        </ul>
      </header>

      {article.headerImageId && (
        // eslint-disable-next-line @next/next/no-img-element -- served by the app's own image API (stored in the database), not a static asset.
        <img src={newsLetterImageUrl(article.headerImageId)} alt="" className="mt-8 aspect-[16/7] w-full rounded-sm object-cover" />
      )}

      <div className="rich-content news-body mt-8 text-[15px]" dangerouslySetInnerHTML={{ __html: article.contentHtml }} />

      <div className="mt-8">
        <ShareButton articleId={article.id} />
      </div>

      <div className="mt-12 border-t border-fb-border pt-4">
        <NeighbourRow page={page} />
      </div>

      <footer className="mt-10 text-[11px] leading-relaxed text-fb-text-secondary">
        <p className="mb-1 inline-flex items-center gap-1 font-bold uppercase tracking-wider">
          <ClockCounterClockwise className="size-3.5" weight="bold" aria-hidden="true" /> Lịch sử thay đổi
        </p>
        <ul>
          <li>Tạo lúc {formatNewsDateTime(article.createdAt)} bởi {article.authorName || '—'}</li>
          {article.edits.map((edit, index) => (
            <li key={`${edit.editedAt}-${index}`}>Sửa lúc {formatNewsDateTime(edit.editedAt)} bởi {edit.editorName || '—'}</li>
          ))}
        </ul>
      </footer>
    </article>
  );
}
