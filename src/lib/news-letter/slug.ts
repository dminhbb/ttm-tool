/**
 * "Tiêu đề ngắn" → slug of "Bản tin" (owner 2026-11-20), used as the article URL in place of the id.
 * Pure module (no database, no React) so the screens and the tests share it.
 *
 * The slug keeps the original letter case and digits, drops the Vietnamese accents (đ → d) and
 * replaces every run of whitespace / non-letter-or-digit characters with a single underscore:
 *   'Quy định sử dụng AI' → 'Quy_dinh_su_dung_AI'
 * An empty / whitespace-only title yields an empty slug (the caller then keeps the id in the URL).
 */

/** True for a character that may stay as-is in a slug (letters of any script, digits). */
function isSlugSafe(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

/** Removes the Vietnamese/Unicode combining accents but keeps the base letter (and its case). */
function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Short title → URL slug: keeps case, drops Vietnamese accents, replaces runs of spaces and other
 * characters that are not letters/digits with a single underscore, trims leading/trailing `_`.
 */
export function newsLetterSlug(shortTitle: string | null | undefined): string {
  const cleaned = String(shortTitle ?? '').normalize('NFC').trim();
  if (!cleaned) return '';
  let out = '';
  let pendingUnderscore = false;
  for (const char of stripAccents(cleaned)) {
    if (isSlugSafe(char)) {
      if (pendingUnderscore && out) out += '_';
      pendingUnderscore = false;
      out += char;
    } else if (out) {
      pendingUnderscore = true;
    }
  }
  return out;
}

/** The title shown on the "Bản tin" menu: "Tiêu đề ngắn" when set, else "Tiêu đề". */
export function newsLetterDisplayTitle(item: { shortTitle: string | null | undefined; title: string }): string {
  const short = item.shortTitle?.trim();
  return short ? short : item.title;
}
