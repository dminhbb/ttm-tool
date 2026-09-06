/**
 * Basic, regex-based safety net for the AD Popup message field (see RichTextEditor / AdPopupCard) —
 * NOT a hardened HTML sanitizer (a real one, e.g. DOMPurify, would parse the DOM properly instead
 * of pattern-matching tags). The actual trust boundary here is "only SUPERADMIN can author this
 * content" (see /api/ad-popups's role gate) — this just strips the obviously dangerous constructs
 * (script execution, event handlers, javascript: URLs) as defense-in-depth against an accidental
 * unsafe paste or a compromised SUPERADMIN session, since this content renders in every logged-in
 * user's browser, not just the author's own.
 */
const DANGEROUS_TAGS = /<\/?(script|style|iframe|object|embed|form|input|textarea|link|meta|base)\b[^>]*>/gi;
const EVENT_HANDLER_ATTR = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_ATTR = /((?:href|src)\s*=\s*)("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeAdPopupHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLER_ATTR, '')
    .replace(JS_URL_ATTR, '$1""');
}

/** Strips tags for a plain-text emptiness check — a WYSIWYG editor's "empty" state is often
 * `<p><br></p>` or similar, which `.trim()` alone wouldn't catch. */
export function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
}
