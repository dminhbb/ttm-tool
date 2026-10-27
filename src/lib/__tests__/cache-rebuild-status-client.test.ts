import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cacheStaleToastText, CACHE_STALE_HEADER, CACHE_STALE_SOURCE_LABELS, describeStaleSources, getCacheRebuildPendingState } from '../cache-rebuild-status-client';

describe('"Cần tạo lại cache" client helpers (2026-10-27)', () => {
  it('names every source markCacheStale is called with, once each', () => {
    assert.equal(describeStaleSources(['users', 'domains', 'users']), 'người dùng / PM-SM, Domain');
    assert.equal(describeStaleSources(['black-listed-epic', 'black-listed-epics']), 'Epic ngoại lệ');
    assert.equal(describeStaleSources(['something-new']), 'something-new');
    for (const source of ['users', 'projects', 'domains', 'black-listed-epics', 'black-listed-epic', 'rule-groups', 'ttm-scope-config', 'sql-import']) {
      assert.ok(CACHE_STALE_SOURCE_LABELS[source], source);
    }
  });

  it('the toast says what changed and who rebuilds', () => {
    const text = cacheStaleToastText('rule-groups');
    assert.ok(text.includes('nhóm rule') && text.includes('SUPERADMIN') && text.includes('Tạo lại cache'));
    assert.equal(CACHE_STALE_HEADER, 'x-cache-stale');
  });

  it('nothing is pending before anybody subscribed (server render, non-SUPERADMIN)', () => {
    assert.deepEqual(getCacheRebuildPendingState(), { pending: false, staleReasons: [] });
  });
});
