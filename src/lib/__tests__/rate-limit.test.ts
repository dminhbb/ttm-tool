import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { checkRateLimit, clientIpOf, createTtlMemo, MAX_RATE_LIMIT_KEYS, peekRateLimit, resetRateLimits } from '../rate-limit';
import { isSlowOperation, withSlowLog } from '../slow-operation';

const rule = { limit: 3, windowMs: 60_000 };

describe('rate limit of the public endpoints', () => {
  beforeEach(() => resetRateLimits());

  it('lets `limit` requests through per window, then refuses with a Retry-After', () => {
    const results = [0, 1, 2, 3].map(() => checkRateLimit('login:1.1.1.1', rule, 1_000));
    assert.deepEqual(results.map((result) => result.allowed), [true, true, true, false]);
    assert.equal(results[3].retryAfterSeconds, 60);
    assert.equal(checkRateLimit('login:1.1.1.1', rule, 31_000).retryAfterSeconds, 30);
  });

  it('counts each key and scope on its own, and starts over when the window ends', () => {
    for (let i = 0; i < 3; i += 1) checkRateLimit('login:1.1.1.1', rule, 0);
    assert.equal(checkRateLimit('login:2.2.2.2', rule, 0).allowed, true);
    assert.equal(checkRateLimit('captcha:1.1.1.1', rule, 0).allowed, true);
    assert.equal(checkRateLimit('login:1.1.1.1', rule, 59_999).allowed, false);
    assert.equal(checkRateLimit('login:1.1.1.1', rule, 60_000).allowed, true);
  });

  it('keeps the number of tracked sources bounded', () => {
    for (let i = 0; i < MAX_RATE_LIMIT_KEYS + 500; i += 1) checkRateLimit(`flood:${i}`, rule, 0);
    // The oldest sources were dropped to make room: the newest is still counted.
    for (let i = 0; i < 3; i += 1) checkRateLimit(`flood:${MAX_RATE_LIMIT_KEYS + 499}`, rule, 0);
    assert.equal(checkRateLimit(`flood:${MAX_RATE_LIMIT_KEYS + 499}`, rule, 0).allowed, false);
  });

  it('peek tells whether one more would be refused, without counting (failure-only limits)', () => {
    for (let i = 0; i < 10; i += 1) assert.equal(peekRateLimit('loginFail:1.1.1.1', rule, 0).allowed, true);
    for (let i = 0; i < 3; i += 1) checkRateLimit('loginFail:1.1.1.1', rule, 0);
    assert.deepEqual(peekRateLimit('loginFail:1.1.1.1', rule, 1_000), { allowed: false, retryAfterSeconds: 59 });
    assert.equal(peekRateLimit('loginFail:1.1.1.1', rule, 60_000).allowed, true);
  });

  it('reads the caller from the proxy headers', () => {
    const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? null });
    assert.equal(clientIpOf(headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' })), '9.9.9.9');
    assert.equal(clientIpOf(headers({ 'x-real-ip': '8.8.8.8' })), '8.8.8.8');
    assert.equal(clientIpOf(headers({})), 'unknown');
  });
});

describe('answers kept for a moment', () => {
  it('one load serves a burst; a failed load is not kept', async () => {
    let loads = 0;
    const memo = createTtlMemo<number>(60_000);
    assert.deepEqual(await Promise.all([memo(async () => ++loads), memo(async () => ++loads)]), [1, 1]);
    const failing = createTtlMemo<number>(60_000);
    await assert.rejects(failing(async () => { throw new Error('down'); }));
    assert.equal(await failing(async () => 7), 7);
  });
});

describe('slow-operation warning', () => {
  it('flags a job that used more than 70% of the function budget', () => {
    assert.equal(isSlowOperation(209_000), false);
    assert.equal(isSlowOperation(211_000), true);
    assert.equal(isSlowOperation(8_000, 10_000), true);
  });

  it('returns the job result unchanged', async () => {
    assert.equal(await withSlowLog('quick job', async () => 42), 42);
  });
});
