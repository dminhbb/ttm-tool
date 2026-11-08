import assert from 'node:assert/strict';
import test from 'node:test';
import { isSuspensionExempt, suspensionAccessFor } from '../system-suspension';
import { sanitizeRichHtml } from '../rich-html-sanitizer';

const visitor = { allowNewsLetter: false, signedIn: false };
const visitorWithNews = { allowNewsLetter: true, signedIn: false };
const userWithNews = { allowNewsLetter: true, signedIn: true };

test('only a SUPERADMIN (also in View as) is exempt', () => {
  assert.equal(isSuspensionExempt({ role: 'SUPERADMIN' }), true);
  assert.equal(isSuspensionExempt({ role: 'USER', viewAs: { actorEmail: 'a', actorId: 1 } }), true);
  for (const role of ['ADMIN', 'SUPERVISOR', 'USER']) assert.equal(isSuspensionExempt({ role }), false);
  assert.equal(isSuspensionExempt(null), false);
});

test('pages go to /suspended, APIs are refused', () => {
  assert.deepEqual(suspensionAccessFor('/', visitor), { kind: 'redirect', to: '/suspended' });
  assert.deepEqual(suspensionAccessFor('/ttm-dashboard-2', visitor), { kind: 'redirect', to: '/suspended' });
  assert.deepEqual(suspensionAccessFor('/news-letter', visitor), { kind: 'redirect', to: '/suspended' });
  assert.deepEqual(suspensionAccessFor('/api/epic-alerts-15', visitor), { kind: 'api-blocked' });
  assert.deepEqual(suspensionAccessFor('/api/news-letter', visitor), { kind: 'api-blocked' });
  // Public paths that must close too.
  assert.deepEqual(suspensionAccessFor('/api/auth/register', visitor), { kind: 'api-blocked' });
  assert.deepEqual(suspensionAccessFor('/api/password-reset-requests', visitor), { kind: 'api-blocked' });
  assert.deepEqual(suspensionAccessFor('/api/sso/authorize', visitor), { kind: 'api-blocked' });
});

test('sign-in, the page itself, MCP and the import API stay open', () => {
  for (const path of ['/suspended', '/login', '/api/auth/login', '/api/auth/logout', '/api/auth/captcha', '/api/system/status',
    '/api/system/suspension', '/api/data-source/import/auto', '/api/mcp', '/api/mcp/oauth/token', '/.well-known/oauth-protected-resource']) {
    assert.deepEqual(suspensionAccessFor(path, visitor), { kind: 'allow' }, path);
  }
  assert.deepEqual(suspensionAccessFor('/api/mcpx', visitor), { kind: 'api-blocked' });
});

test('"Bản tin" exception: its screens and API, plus the avatar menu for a signed-in user', () => {
  for (const path of ['/news-letter', '/news-letter/12', '/api/news-letter', '/api/news-letter/images/abc']) {
    assert.deepEqual(suspensionAccessFor(path, visitorWithNews), { kind: 'allow' }, path);
  }
  assert.deepEqual(suspensionAccessFor('/news-letterx', userWithNews), { kind: 'redirect', to: '/news-letter' });
  for (const path of ['/api/auth/me', '/api/auth/change-password', '/api/rule-group-summary', '/docs/product', '/api/mcp-tokens']) {
    assert.deepEqual(suspensionAccessFor(path, userWithNews), { kind: 'allow' }, path);
    assert.notDeepEqual(suspensionAccessFor(path, visitorWithNews), { kind: 'allow' }, path);
  }
  // Every other screen sends a signed-in user back to "Bản tin".
  assert.deepEqual(suspensionAccessFor('/', userWithNews), { kind: 'redirect', to: '/news-letter' });
  assert.deepEqual(suspensionAccessFor('/epic-alerts-15', userWithNews), { kind: 'redirect', to: '/news-letter' });
  assert.deepEqual(suspensionAccessFor('/api/epic-alerts-15', userWithNews), { kind: 'api-blocked' });
});

test('the message keeps clickable links (http, https, mailto) and nothing dangerous', () => {
  const html = sanitizeRichHtml('<p onclick="x()">Liên hệ <a href="mailto:it@mbbank.com.vn">IT</a> <a href="https://a.vn">web</a> <a href="javascript:alert(1)">bad</a><script>alert(1)</script><img src="x"></p>');
  assert.match(html, /<a href="mailto:it@mbbank.com.vn" target="_blank" rel="noopener noreferrer nofollow">IT<\/a>/);
  assert.match(html, /<a href="https:\/\/a.vn" target="_blank"/);
  assert.doesNotMatch(html, /javascript|script|onclick|<img/);
});
