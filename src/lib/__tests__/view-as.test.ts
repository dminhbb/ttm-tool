import assert from 'node:assert/strict';
import test from 'node:test';
import { isWriteBlockedInViewAs } from '../view-as';

test('View as is read-only: API writes are refused, reads and pages are not', () => {
  assert.equal(isWriteBlockedInViewAs('GET', '/api/epic-alerts'), false);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/users'), true);
  assert.equal(isWriteBlockedInViewAs('PUT', '/api/projects'), true);
  assert.equal(isWriteBlockedInViewAs('DELETE', '/api/holidays'), true);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/auth/change-password'), true);
  assert.equal(isWriteBlockedInViewAs('PATCH', '/api/auth/me'), true);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/usage-stats/track'), true);
  assert.equal(isWriteBlockedInViewAs('POST', '/dashboard'), false);
});

test('View as keeps open only its own endpoint and the read-only report POSTs', () => {
  for (const method of ['POST', 'DELETE']) assert.equal(isWriteBlockedInViewAs(method, '/api/auth/view-as'), false);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/reports'), false);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/rule-groups/preview'), false);
  assert.equal(isWriteBlockedInViewAs('POST', '/api/reports/anything-else'), true);
  assert.equal(isWriteBlockedInViewAs('post', '/api/rule-groups'), true);
});
