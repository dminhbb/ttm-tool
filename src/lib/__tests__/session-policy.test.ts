import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renewedSessionExpiry, screenRenewsSession } from '../session-policy';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = new Date('2026-11-03T10:00:00.000Z');
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

describe('Session renewal (owner 2026-11-03)', () => {
  it('10 minutes left → renewed to 2 hours from now', () => {
    const renewed = renewedSessionExpiry({ createdAt: at(-23 * HOUR), expiresAt: at(10 * MIN), remember: true }, now);
    assert.equal(renewed?.toISOString(), at(2 * HOUR).toISOString());
  });

  it('35 minutes left (or exactly 30) → not renewed', () => {
    assert.equal(renewedSessionExpiry({ createdAt: at(-HOUR), expiresAt: at(35 * MIN), remember: false }, now), null);
    assert.equal(renewedSessionExpiry({ createdAt: at(-HOUR), expiresAt: at(30 * MIN), remember: false }, now), null);
  });

  it('an expired session is never renewed', () => {
    assert.equal(renewedSessionExpiry({ createdAt: at(-3 * HOUR), expiresAt: at(-MIN), remember: false }, now), null);
  });

  it('never past the ceiling from login: 12 h standard, 2 days remembered', () => {
    // Standard session logged in 11 h ago: ceiling is 1 h from now, so it only reaches that.
    assert.equal(renewedSessionExpiry({ createdAt: at(-11 * HOUR), expiresAt: at(10 * MIN), remember: false }, now)?.toISOString(), at(HOUR).toISOString());
    // Remembered session 47h50 old with 10 minutes left: the ceiling is already its expiry — no renewal.
    assert.equal(renewedSessionExpiry({ createdAt: at(-(47 * HOUR + 50 * MIN)), expiresAt: at(10 * MIN), remember: true }, now), null);
    // Remembered session 40 h old: plenty of room, a full 2 h.
    assert.equal(renewedSessionExpiry({ createdAt: at(-40 * HOUR), expiresAt: at(5 * MIN), remember: true }, now)?.toISOString(), at(2 * HOUR).toISOString());
  });

  it('only the chosen screens renew, two of them only for their roles', () => {
    for (const path of ['/ttm-dashboard-2', '/reports', '/visit-stats', '/epic-alerts-15']) assert.equal(screenRenewsSession(path, 'USER'), true, path);
    assert.equal(screenRenewsSession('/', 'SUPERADMIN'), true);
    assert.equal(screenRenewsSession('/', 'ADMIN'), false);
    assert.equal(screenRenewsSession('/admin/users', 'ADMIN'), true);
    assert.equal(screenRenewsSession('/admin/users', 'USER'), false);
    assert.equal(screenRenewsSession('/data-normalization', 'SUPERADMIN'), false);
    assert.equal(screenRenewsSession('/epic-alerts-15/x', 'USER'), false);
    assert.equal(screenRenewsSession('constructor', 'USER'), false);
    assert.equal(screenRenewsSession(null, 'USER'), false);
  });
});
