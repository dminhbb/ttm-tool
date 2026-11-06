import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { newsLetterImageIdsOf, richHtmlToText, sanitizeRichHtml } from '@/lib/rich-html-sanitizer';
import { sniffImageMime } from '@/lib/news-letter/image-sniff';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('sanitizeRichHtml (Bản tin / Popup quảng cáo, 2026-11-06)', () => {
  it('drops scripts, iframes, event handlers and javascript: links', () => {
    const html = sanitizeRichHtml('<p onclick="x()">Hi<script>alert(1)</script></p><iframe src="https://evil"></iframe><a href="javascript:alert(1)">x</a><style>p{}</style>');
    assert.equal(html.includes('script'), false);
    assert.equal(html.includes('iframe'), false);
    assert.equal(html.includes('onclick'), false);
    assert.equal(html.includes('javascript:'), false);
    assert.equal(html.includes('<style'), false);
    assert.ok(html.includes('<p>Hi</p>'));
  });

  it('keeps formatting, tables and text-align; every link opens safely in a new tab', () => {
    const html = sanitizeRichHtml('<p style="text-align: center; color: red">A <strong>b</strong></p><table><tbody><tr><td colspan="2">c</td></tr></tbody></table><a href="https://mbbank.com.vn">l</a>');
    assert.ok(html.includes('<p style="text-align:center">'));
    assert.ok(html.includes('<td colspan="2">'));
    assert.ok(html.includes('target="_blank"') && html.includes('rel="noopener noreferrer nofollow"'));
    assert.equal(html.includes('color'), false);
  });

  it('headings only for articles', () => {
    assert.equal(sanitizeRichHtml('<h2>T</h2>').includes('<h2>'), false);
    assert.ok(sanitizeRichHtml('<h2>T</h2>', { headings: true }).includes('<h2>T</h2>'));
  });

  it('images: only the app image API, only allowed ids, never data: or outside URLs', () => {
    const html = `<img src="/api/news-letter/images/${ID}"><img src="/api/news-letter/images/${OTHER}"><img src="data:image/png;base64,AAAA"><img src="https://evil/x.png">`;
    assert.equal(sanitizeRichHtml(html).includes('<img'), false);
    const kept = sanitizeRichHtml(html, { allowImageId: (id) => id === ID });
    assert.deepEqual(newsLetterImageIdsOf(kept), [ID]);
    assert.equal(kept.includes('data:'), false);
    assert.equal(kept.includes('evil'), false);
  });

  it('plain text of an empty editor is empty', () => {
    assert.equal(richHtmlToText('<p></p><p> &nbsp; </p>'), '');
    assert.equal(richHtmlToText('<p>Xin <b>chào</b></p>'), 'Xin chào');
  });
});

describe('sniffImageMime', () => {
  const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
  it('reads the real type from the first bytes', () => {
    assert.equal(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png');
    assert.equal(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
    assert.equal(sniffImageMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)), 'image/webp');
    assert.equal(sniffImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)), 'image/gif');
  });
  it('refuses SVG, HTML and anything else', () => {
    const text = (value: string) => new TextEncoder().encode(value.padEnd(32, ' '));
    assert.equal(sniffImageMime(text('<svg xmlns="http://www.w3.org/2000/svg">')), null);
    assert.equal(sniffImageMime(text('<html><script>')), null);
    assert.equal(sniffImageMime(new Uint8Array(4)), null);
  });
});
