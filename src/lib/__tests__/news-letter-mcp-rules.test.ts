import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clipText,
  isMcpExcludedFolder,
  isNewsLetterHashtag,
  newsLetterHtmlToText,
  newsLetterSearchScore,
  searchSnippet,
} from '../news-letter/mcp-rules';

test('the Bản tin tools answer only to the hashtag #bantin', () => {
  assert.equal(isNewsLetterHashtag('#bantin'), true);
  assert.equal(isNewsLetterHashtag(' #BanTin '), true);
  assert.equal(isNewsLetterHashtag('#bảntin'), true);
  assert.equal(isNewsLetterHashtag('bantin'), false);
  assert.equal(isNewsLetterHashtag('#guibantin'), false);
  assert.equal(isNewsLetterHashtag(''), false);
  assert.equal(isNewsLetterHashtag(undefined), false);
});

test('the folder kept from MCP is recognised by its id (2), never by its name', () => {
  assert.equal(isMcpExcludedFolder(2), true);
  assert.equal(isMcpExcludedFolder(1), false);
  assert.equal(isMcpExcludedFolder(3), false);
  // No folder: always open.
  assert.equal(isMcpExcludedFolder(null), false);
  assert.equal(isMcpExcludedFolder(undefined), false);
});

test('article HTML becomes readable text and keeps link addresses', () => {
  const text = newsLetterHtmlToText(
    '<h2>Tiêu đề</h2><p>Xem <a href="https://a.vn/x?a=1&amp;b=2" target="_blank">trang này</a>, email <a href="mailto:it@mbbank.com.vn">it@mbbank.com.vn</a>.</p>'
    + '<ul><li>Một</li><li>Hai &lt;3</li></ul><img src="/api/news-letter/images/x"><table><tr><td>A</td><td>B</td></tr></table>',
  );
  assert.equal(text, 'Tiêu đề\nXem trang này (https://a.vn/x?a=1&b=2), email it@mbbank.com.vn.\n- Một\n- Hai <3\nA | B');
});

test('long text is cut and marked', () => {
  assert.deepEqual(clipText('ngắn', 10), { text: 'ngắn', truncated: false });
  const cut = clipText('một hai ba bốn năm sáu bảy', 12);
  assert.equal(cut.truncated, true);
  assert.ok(cut.text.endsWith('…') && cut.text.length <= 13);
});

test('search ignores accents, needs every word, and ranks title hits first', () => {
  const inTitle = { folder: 'Báo cáo', summary: null, text: 'nội dung', title: 'Báo cáo Time to Market tháng 10' };
  const inBody = { folder: 'Khác', summary: 'tóm tắt', text: 'Kết quả time to market tháng 10 của khối', title: 'Tin nội bộ' };
  assert.ok(newsLetterSearchScore(inTitle, 'time to market') > newsLetterSearchScore(inBody, 'time to market'));
  assert.ok(newsLetterSearchScore(inBody, 'ket qua thang') > 0);
  assert.equal(newsLetterSearchScore(inBody, 'ket qua quy 3'), 0);
  assert.equal(newsLetterSearchScore(inBody, ''), 1);
  // The hashtag itself is not a search word.
  assert.equal(newsLetterSearchScore(inBody, '#bantin'), 1);
});

test('the snippet is taken around the first word found', () => {
  const text = `${'mở đầu '.repeat(60)}Đường dẫn báo cáo TTM mới ở đây ${'kết thúc '.repeat(60)}`;
  const snippet = searchSnippet(text, 'duong dan');
  assert.ok(snippet.startsWith('…') && snippet.includes('Đường dẫn báo cáo TTM'));
});
