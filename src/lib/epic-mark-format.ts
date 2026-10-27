/**
 * "Epic Mark" — shared (client + server) constants and formatting. One comment reads
 * `{Ngày - Giờ} - {User} : {Comment}`; the part before the colon is shown in bold.
 */

export const EPIC_COMMENT_MAX_LENGTH = 256;
export const EPIC_HIDE_COMMENT = 'Đã ẩn Epic';
export const EPIC_UNHIDE_COMMENT = 'Đã bỏ ẩn Epic';

export interface EpicCommentEntry {
  content: string;
  /** ISO timestamp. */
  createdAt: string;
  id: number;
  isSystem: boolean;
  userName: string;
}

/** What a list row carries about its Epic's mark (stamped after the row cache — never cached). */
export interface EpicMarkSummary {
  commentCount: number;
  isHidden: boolean;
  /** The two newest comments, newest first. */
  latestComments: EpicCommentEntry[];
}

const VN_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', hour: '2-digit', hour12: false, minute: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric',
});

/** "27/10/2026 - 14:35" in Vietnam time. */
export function formatCommentStamp(iso: string): string {
  const parts = Object.fromEntries(VN_DATE_TIME.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} - ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
}

/** The bold head of a comment line: "27/10/2026 - 14:35 - Nguyen Van A". */
export function formatCommentHead(entry: Pick<EpicCommentEntry, 'createdAt' | 'userName'>): string {
  return `${formatCommentStamp(entry.createdAt)} - ${entry.userName}`;
}

/** The whole line as plain text, e.g. for a tooltip: "{Ngày - Giờ} - {User} : {Comment}". */
export function formatCommentLine(entry: EpicCommentEntry): string {
  return `${formatCommentHead(entry)} : ${entry.content}`;
}

/**
 * Characters never kept in a comment (information security — the text is shown to other users):
 * control characters (incl. NUL, which PostgreSQL rejects), invisible / bidi-override / line-separator
 * characters (they hide or reorder text), HTML-significant "<" ">" and backticks (no tags, no template
 * syntax), noncharacters and unpaired surrogates.
 */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xffff],
];
const unicodeEscape = (code: number) => String.fromCharCode(92) + 'u' + code.toString(16).padStart(4, '0');
const UNSAFE_CHARACTERS = new RegExp(
  '[' + UNSAFE_RANGES.map(([from, to]) => (from === to ? unicodeEscape(from) : unicodeEscape(from) + '-' + unicodeEscape(to))).join('') + '<>`]'
  + '|[' + unicodeEscape(0xd800) + '-' + unicodeEscape(0xdbff) + '](?![' + unicodeEscape(0xdc00) + '-' + unicodeEscape(0xdfff) + '])'
  + '|(?<![' + unicodeEscape(0xd800) + '-' + unicodeEscape(0xdbff) + '])[' + unicodeEscape(0xdc00) + '-' + unicodeEscape(0xdfff) + ']',
  'g',
);
/** URL schemes that run code or embed data when followed as a link — defused by breaking "scheme:". */
const DANGEROUS_SCHEMES = /\b(javascript|vbscript|data|file)\s*:/gi;

/**
 * Filters user-typed comment text: removes the characters above, defuses dangerous URL schemes, drops a
 * leading "=", "+" or "@" (spreadsheet formula injection if comments are ever exported) and collapses
 * whitespace. Used by the popup and again by the API, so what is stored is always the filtered text.
 * Returns null when nothing is left or the result is over the limit.
 */
export function normalizeCommentText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(UNSAFE_CHARACTERS, '')
    .replace(DANGEROUS_SCHEMES, '$1 -')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[=+@]+\s*/, '');
  return text.length > 0 && text.length <= EPIC_COMMENT_MAX_LENGTH ? text : null;
}
