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

/** Plain text of an HTML fragment (emptiness checks, list previews). */
export function richHtmlToText(html: string): string {
  return sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
