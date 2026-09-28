import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Knowledge source for the MCP tools search_product_docs / get_product_doc_section: the in-app
 * "Tài liệu sản phẩm" (/docs/product → public/docs/product-guide.html). Read and parsed at runtime
 * (cached per server instance) rather than copied into a generated file, so whatever that HTML says
 * is always exactly what the AI chatbot answers from — no second copy to drift. next.config.ts's
 * outputFileTracingIncludes ships the HTML into the /api/mcp function bundle on Vercel.
 *
 * Granularity: one chunk per <h2>/<h3> heading (e.g. "8.3. Cột Nhận xét ..."), each carrying its
 * parent <h2> title so a chunk read alone still says which chapter it belongs to.
 */

export const PRODUCT_DOC_PATH = path.join(process.cwd(), 'public', 'docs', 'product-guide.html');
export const PRODUCT_DOC_URL_PATH = '/docs/product';

export interface ProductDocSection {
  /** Stable-ish id: the heading number ("8.3") when present, otherwise the <section id> + index. */
  id: string;
  title: string;
  chapter: string;
  level: 2 | 3;
  text: string;
}

let cache: { mtimeKey: string; sections: ProductDocSection[] } | null = null;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rarr: '→', larr: '←', ge: '≥', le: '≤', ne: '≠', mdash: '—', ndash: '–', hellip: '…', times: '×' };

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#') && lower !== '#39') return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? match;
  });
}

/** HTML fragment → readable plain text: tables become " | "-separated rows, list items "- ". */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(td|th)>/gi, ' | ')
      .replace(/<(tr|li)[^>]*>/gi, (_, tag: string) => (tag.toLowerCase() === 'li' ? '\n- ' : '\n'))
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|ul|ol|table|pre|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').replace(/\s*\|\s*$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

export function parseProductDoc(html: string): ProductDocSection[] {
  const bodyStart = html.search(/<body[^>]*>/i);
  const body = (bodyStart >= 0 ? html.slice(bodyStart) : html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  const headingRe = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: { level: 2 | 3; title: string; start: number; end: number }[] = [];
  for (let match = headingRe.exec(body); match; match = headingRe.exec(body)) {
    headings.push({ level: Number(match[1]) as 2 | 3, title: htmlToText(match[2]).replace(/\n/g, ' '), start: match.index, end: headingRe.lastIndex });
  }

  const sections: ProductDocSection[] = [];
  const usedIds = new Set<string>();
  let chapter = '';
  headings.forEach((heading, index) => {
    if (heading.level === 2) chapter = heading.title;
    const next = headings[index + 1];
    const text = htmlToText(body.slice(heading.end, next ? next.start : body.length));
    const numbered = /^(\d+(?:\.\d+)*)\.?\s/.exec(heading.title)?.[1];
    let id = numbered ?? `muc-${index + 1}`;
    // Duplicate numbering exists in the source (two "11.6." headings) — keep ids unique.
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${numbered ?? `muc-${index + 1}`}-${suffix}`;
    usedIds.add(id);
    sections.push({ chapter, id, level: heading.level, text, title: heading.title });
  });
  return sections;
}

export async function getProductDocSections(): Promise<ProductDocSection[]> {
  const html = await readFile(PRODUCT_DOC_PATH, 'utf8');
  const key = `${html.length}:${html.slice(-200)}`;
  if (cache?.mtimeKey === key) return cache.sections;
  const sections = parseProductDoc(html);
  cache = { mtimeKey: key, sections };
  return sections;
}

/** Lowercase + strip Vietnamese diacritics (đ → d) so "canh bao" matches "cảnh báo". */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

const STOP_WORDS = new Set(['la', 'gi', 'nao', 'the', 'cua', 've', 'cho', 'va', 'co', 'khong', 'nhu', 'duoc', 'trong', 'mot', 'cac', 'nhung', 'bao', 'nhieu', 'what', 'how', 'the', 'is', 'of', 'and']);

function tokenize(value: string): string[] {
  return normalizeForSearch(value).split(/[^a-z0-9_-]+/).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

export interface ProductDocSearchHit extends ProductDocSection {
  score: number;
  truncated: boolean;
}

/**
 * Simple keyword ranking (no embeddings — the doc is ~70 chunks, small enough that term
 * frequency + a title boost + a phrase bonus is plenty): each query token scores its occurrences in
 * the chunk text, ×5 when in the heading/chapter; the whole normalized query appearing verbatim
 * adds a bonus. Also matches bigrams so "nhan xet" beats chunks that merely mention "nhan" + "xet".
 */
export async function searchProductDocs(query: string, limit = 5, maxCharsPerSection = 6000): Promise<ProductDocSearchHit[]> {
  const sections = await getProductDocSections();
  const tokens = [...new Set(tokenize(query))];
  const bigrams = tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`);
  const phrase = normalizeForSearch(query).trim();
  if (tokens.length === 0) return [];

  return sections
    .map((section) => {
      const title = normalizeForSearch(`${section.title} ${section.chapter}`);
      const text = normalizeForSearch(section.text);
      let score = 0;
      let matchedTokens = 0;
      for (const token of tokens) {
        const inText = countOccurrences(text, token);
        const inTitle = countOccurrences(title, token);
        if (inText + inTitle > 0) matchedTokens += 1;
        score += Math.min(inText, 10) + inTitle * 5;
      }
      for (const bigram of bigrams) score += (countOccurrences(text, bigram) + countOccurrences(title, bigram) * 5) * 3;
      if (phrase.length > 3 && (text.includes(phrase) || title.includes(phrase))) score += 20;
      // Favour chunks that cover more of the query's distinct terms.
      score *= matchedTokens / tokens.length;
      return { section, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ section, score }) => ({
      ...section,
      score: Math.round(score * 10) / 10,
      text: section.text.length > maxCharsPerSection ? `${section.text.slice(0, maxCharsPerSection)}\n…(đã cắt bớt — gọi get_product_doc_section với id "${section.id}" để đọc đầy đủ)` : section.text,
      truncated: section.text.length > maxCharsPerSection,
    }));
}
