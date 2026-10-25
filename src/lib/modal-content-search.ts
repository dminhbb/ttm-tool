/**
 * Pure functions for in-modal content searching and DOM text highlighting.
 */

export interface ParsedSearchQuery {
  mode: 'exact' | 'words';
  terms: string[];
}

/**
 * Parses user search keyword according to requirements:
 * 1. If keyword is enclosed in single quotes '...', double quotes "...", curly quotes ‘...’ / “...”,
 *    parentheses (...), or words are joined with '+':
 *    -> searches for the exact phrase (e.g. 'abc xyz' or "abc xyz" or abc+xyz -> exact phrase 'abc xyz')
 * 2. If keyword contains multiple words without quotes or '+':
 *    -> highlights all occurrences of each individual word
 */
export function parseModalSearchQuery(rawQuery: string): ParsedSearchQuery {
  let q = rawQuery.trim();
  if (!q) return { mode: 'words', terms: [] };

  const quotePairs = [
    ["'", "'"],
    ['"', '"'],
    ['“', '”'],
    ['‘', '’'],
    ['(', ')'],
  ] as const;

  for (const [open, close] of quotePairs) {
    if (q.startsWith(open) && q.endsWith(close) && q.length >= open.length + close.length) {
      q = q.slice(open.length, q.length - close.length).trim();
      return { mode: 'exact', terms: q ? [q] : [] };
    }
  }

  if (q.includes('+')) {
    const phrase = q
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ');
    return { mode: 'exact', terms: phrase ? [phrase] : [] };
  }

  const words = q.split(/\s+/).filter(Boolean);
  return { mode: 'words', terms: words };
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a RegExp matching the parsed query.
 * - 'exact' mode: matches words of the phrase with one or more whitespace characters in between.
 * - 'words' mode: matches any of the individual words (longer terms first to avoid prefix shadowing).
 */
export function buildSearchRegex(rawQuery: string): RegExp | null {
  const parsed = parseModalSearchQuery(rawQuery);
  if (parsed.terms.length === 0) return null;

  if (parsed.mode === 'exact') {
    const phrase = parsed.terms[0];
    if (!phrase) return null;
    const parts = phrase.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (parts.length === 0) return null;
    return new RegExp(parts.join('\\s+'), 'gi');
  }

  const uniqueTerms = Array.from(new Set(parsed.terms))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (uniqueTerms.length === 0) return null;
  return new RegExp(uniqueTerms.join('|'), 'gi');
}

/**
 * Removes all search highlight marks inside root and merges adjacent text nodes.
 */
export function clearModalHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll('mark.ttm-modal-search-highlight');
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
  root.normalize();
}

/**
 * Walks text nodes in root, splits them by regex matches and wraps matches in <mark>.
 * Returns array of created <mark> elements in document order.
 */
export function highlightModalMatches(root: HTMLElement, regex: RegExp): HTMLElement[] {
  clearModalHighlights(root);

  // If running in a non-browser environment without document
  if (typeof document === 'undefined') return [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Do not highlight inside interactive controls, scripts, styles, or SVG diagrams
      if (parent.closest('svg, script, style, textarea, input, button, select')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let curr = walker.nextNode();
  while (curr) {
    textNodes.push(curr as Text);
    curr = walker.nextNode();
  }

  const matchElements: HTMLElement[] = [];

  for (const node of textNodes) {
    const text = node.nodeValue;
    if (!text) continue;

    regex.lastIndex = 0;
    let match = regex.exec(text);
    if (!match || match[0].length === 0) continue;

    const matchesInNode: { start: number; end: number; text: string }[] = [];
    while (match && match[0].length > 0) {
      matchesInNode.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
      match = regex.exec(text);
    }

    if (matchesInNode.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;

    for (const m of matchesInNode) {
      if (m.start > lastIdx) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, m.start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'ttm-modal-search-highlight';
      mark.textContent = m.text;
      fragment.appendChild(mark);
      matchElements.push(mark);
      lastIdx = m.end;
    }

    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    node.parentNode?.replaceChild(fragment, node);
  }

  return matchElements;
}
