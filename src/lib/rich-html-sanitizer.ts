import { find as findLinks } from 'linkifyjs';
import sanitizeHtml from 'sanitize-html';

/**
 * Server-side HTML sanitizer for every rich-text field written with the TipTap editor (components/ui/TiptapEditor.tsx):
 * articles of "Bản tin" and the message of "Popup quảng cáo" (owner 2026-11-06). A real parser (sanitize-html) with an
 * allow-list — everything not listed is dropped: scripts, iframes, forms, styles other than text-align / table widths,
 * event handlers (on*), javascript:/data: URLs. Runs before the HTML is stored, and again before it is served.
 *
 * Images are only allowed for the article body, and only pointing at the app's own image API
 * (/api/news-letter/images/<uuid>) — never a data: URI or an outside URL; `allowImageId` narrows them further to the
 * images the article may use.
 */

export const NEWS_LETTER_IMAGE_PATH = '/api/news-letter/images/';
const IMAGE_SRC_PATTERN = /^\/api\/news-letter\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The image ids an HTML fragment points at (in order, without duplicates). */
export function newsLetterImageIdsOf(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\/api\/news-letter\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g)) ids.add(match[1]);
  return [...ids];
}

export interface RichHtmlOptions {
  /** Article body: keep <img> whose id this accepts. Omitted = no image at all (ad popup). */
  allowImageId?: (id: string) => boolean;
  /** Headings h2–h4 (article body). */
  headings?: boolean;
}

const PX = /^\d{1,4}(\.\d+)?px$/;

export function sanitizeRichHtml(html: string, options: RichHtmlOptions = {}): string {
  const allowImages = Boolean(options.allowImageId);
  return sanitizeHtml(html ?? '', {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
      'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
      ...(options.headings ? ['h2', 'h3', 'h4'] : []),
      ...(allowImages ? ['img'] : []),
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      th: ['colspan', 'rowspan', 'colwidth'],
      td: ['colspan', 'rowspan', 'colwidth'],
      '*': ['style'],
    },
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center|justify)$/] },
      table: { 'min-width': [PX], width: [PX] },
      col: { 'min-width': [PX], width: [PX] },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      // Every link opens in a new tab without giving the page a handle on this one.
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== 'img') return false;
      const match = IMAGE_SRC_PATTERN.exec(frame.attribs.src ?? '');
      return !match || !options.allowImageId?.(match[1]);
    },
  });
}

const unescapeText = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Tags whose text is never turned into a link. */
const NO_LINKIFY_TAGS = new Set(['a', 'code', 'pre']);

/**
 * Sanitized HTML where web addresses and e-mail addresses still written as plain text become links too (an e-mail →
 * mailto:) — the editor links them only once a space or Enter follows, so an address typed last and saved at once stays
 * plain text. Text inside a link, code or pre is left alone. The result goes through sanitizeRichHtml again, so the same
 * allow-list (http / https / mailto, new tab) applies to the links added here.
 */
export function linkifyRichHtml(html: string, options: RichHtmlOptions = {}): string {
  // sanitize-html output: every '<' / '>' outside a tag is escaped, so splitting on tags is exact.
  const parts = sanitizeRichHtml(html, options).split(/(<[^>]*>)/);
  let skipDepth = 0;
  const out = parts.map((part) => {
    const tag = /^<(\/?)([a-z0-9]+)/i.exec(part);
    if (tag) {
      if (NO_LINKIFY_TAGS.has(tag[2].toLowerCase()) && !part.endsWith('/>')) skipDepth = Math.max(0, skipDepth + (tag[1] ? -1 : 1));
      return part;
    }
    if (skipDepth > 0 || !part) return part;
    const text = unescapeText(part);
    const links = findLinks(text, { defaultProtocol: 'https' }).filter((link) => link.type === 'url' || link.type === 'email');
    if (!links.length) return part;
    let result = '';
    let cursor = 0;
    for (const link of links) {
      result += escapeText(text.slice(cursor, link.start));
      result += `<a href="${escapeText(link.href)}">${escapeText(link.value)}</a>`;
      cursor = link.end;
    }
    return result + escapeText(text.slice(cursor));
  });
  return sanitizeRichHtml(out.join(''), options);
}

/** Plain text of an HTML fragment (emptiness checks, list previews). */
export function richHtmlToText(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
