// "Bản tin" over MCP (owner 2026-11-08): an AI chatbot may read the articles, except those of the folder "Thông báo từ
// hệ thống", and only when the user's message carries the hashtag #bantin. Pure module (no database) — the rules, the
// HTML → text conversion and the search, shared by the MCP tools (mcp-server.ts) and the tests.

/** Hashtag the user's message must carry for the chatbot to call the Bản tin tools. */
export const NEWS_LETTER_MCP_HASHTAG = '#bantin';
/** Folder never returned over MCP (matched by name: case, accents and spacing ignored). */
export const NEWS_LETTER_MCP_EXCLUDED_FOLDER = 'Thông báo từ hệ thống';
/** Newest articles searched per call; the article text returned is cut at this many characters. */
export const NEWS_LETTER_MCP_SEARCH_WINDOW = 300;
export const NEWS_LETTER_MCP_TEXT_MAX = 30_000;
export const NEWS_LETTER_MCP_DEFAULT_LIMIT = 10;
export const NEWS_LETTER_MCP_MAX_LIMIT = 30;

export const NEWS_LETTER_MCP_HASHTAG_REFUSAL =
  `Công cụ Bản tin chỉ trả kết quả khi câu lệnh của người dùng có hashtag ${NEWS_LETTER_MCP_HASHTAG}. `
  + `Hãy nhắc người dùng thêm ${NEWS_LETTER_MCP_HASHTAG} vào câu hỏi nếu muốn tra cứu Bản tin.`;

/** Lower case, no Vietnamese accents (đ → d), single spaces. */
export function foldForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when the hashtag the chatbot passed is #bantin (case-insensitive). */
export function isNewsLetterHashtag(value: string | null | undefined): boolean {
  return foldForSearch(value ?? '') === NEWS_LETTER_MCP_HASHTAG;
}

export function isMcpExcludedFolder(name: string | null | undefined): boolean {
  return foldForSearch(name ?? '') === foldForSearch(NEWS_LETTER_MCP_EXCLUDED_FOLDER);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? match;
  });
}

/**
 * Article HTML (already sanitized) → plain text a chatbot can quote: paragraphs on their own lines, list items "- ",
 * table cells " | ", links "text (address)" so the address is not lost, images dropped.
 */
export function newsLetterHtmlToText(html: string): string {
  return decodeEntities(
    (html ?? '')
      .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').trim();
        const address = decodeEntities(href);
        const plain = address.replace(/^mailto:/i, '');
        return !text || text === address || text === plain ? address.replace(/^mailto:/i, '') : `${text} (${plain})`;
      })
      .replace(/<img\b[^>]*>/gi, ' ')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<(tr|li)\b[^>]*>/gi, (_, tag: string) => (tag.toLowerCase() === 'li' ? '\n- ' : '\n'))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|ul|ol|table|pre|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').replace(/\s*\|\s*$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Cuts the text at `max` characters (on a word boundary when it can), marking the cut. */
export function clipText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return { text: `${space > max * 0.8 ? cut.slice(0, space) : cut}…`, truncated: true };
}

export interface NewsLetterSearchable {
  folder: string | null;
  summary: string | null;
  text: string;
  title: string;
}

function searchTokens(query: string): string[] {
  return foldForSearch(query).split(/[^a-z0-9]+/).filter((token) => token.length > 1 && token !== 'bantin');
}

/**
 * Score of an article for `query` (accent-insensitive): 0 = not a match (some word of the query appears nowhere), else
 * higher = better (the whole phrase, and words found in the title, count more). An empty query matches everything (1).
 */
export function newsLetterSearchScore(article: NewsLetterSearchable, query: string | undefined): number {
  const tokens = searchTokens(query ?? '');
  if (!tokens.length) return 1;
  const title = foldForSearch(article.title);
  const body = foldForSearch(`${article.summary ?? ''} ${article.folder ?? ''} ${article.text}`);
  if (!tokens.every((token) => title.includes(token) || body.includes(token))) return 0;
  const phrase = tokens.join(' ');
  return 1
    + tokens.filter((token) => title.includes(token)).length * 3
    + (title.includes(phrase) ? 10 : 0)
    + (body.includes(phrase) ? 4 : 0);
}

/** About 240 characters of `text` around the first word of `query` found in it (start of the text otherwise). */
export function searchSnippet(text: string, query: string | undefined, size = 240): string {
  const flat = text.normalize('NFC').replace(/\s+/g, ' ');
  // Same length as `flat` (one precomposed letter → one letter), so an index found in it points into `flat`.
  const folded = flat.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const at = searchTokens(query ?? '').map((token) => folded.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - Math.floor(size / 3));
  const piece = flat.slice(start, start + size).trim();
  return `${start > 0 ? '…' : ''}${piece}${start + size < flat.length ? '…' : ''}`;
}
