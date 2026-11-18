import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  claimBottomRightSlot,
  FLOAT_MESSAGE_GAP_MS,
  FLOAT_MESSAGE_PRIORITY,
  FloatMessageQueue,
  isBottomRightSlotBusy,
  NON_ADMIN_FLOAT_TIMEOUT_SECONDS,
  subscribeBottomRightSlot,
} from '../bottom-right-slot';
import {
  buildFloatMessageList,
  DEFAULT_FLOAT_MESSAGE,
  DEFAULT_FLOAT_MESSAGE_PRIORITIES,
  FloatMessageInputError,
  normalizeFloatMessageUrl,
  validateFloatMessagePriorities,
  isFloatMessageShownOn,
  publicFloatMessageOf,
  validateFloatMessageInput,
  type FloatMessageSettings,
} from '../float-message';

const VALID = {
  autoHideSeconds: 10,
  dismissible: true,
  endDate: '2026-11-30',
  isActive: true,
  messageText: '  Bảo trì hệ thống\r\nlúc 20:00  ',
  position: 'BOTTOM_RIGHT',
  startDate: '2026-11-17',
};

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; fn: () => void }>();

  const timers = {
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      scheduled.set(id, { at: now + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => {
      scheduled.delete(handle as unknown as number);
    },
  };

  const advance = (ms: number) => {
    const target = now + ms;
    while (true) {
      let earliestId: number | null = null;
      let earliestAt = Infinity;
      for (const [id, entry] of scheduled.entries()) {
        if (entry.at <= target && entry.at < earliestAt) {
          earliestAt = entry.at;
          earliestId = id;
        }
      }
      if (earliestId === null) break;
      const entry = scheduled.get(earliestId)!;
      scheduled.delete(earliestId);
      now = entry.at;
      entry.fn();
    }
    now = target;
  };

  return { advance, timers };
}

describe('validateFloatMessageInput', () => {
  it('accepts a valid input, trims the text and turns pasted line breaks into a space (one line)', () => {
    const input = validateFloatMessageInput(VALID);
    assert.equal(input.messageText, 'Bảo trì hệ thống lúc 20:00');
    assert.equal(input.autoHideSeconds, 10);
    assert.equal(input.position, 'BOTTOM_RIGHT');
  });

  it('null / missing seconds = always shown; blank dates = no bound', () => {
    const input = validateFloatMessageInput({ ...VALID, autoHideSeconds: null, endDate: '', startDate: null });
    assert.equal(input.autoHideSeconds, null);
    assert.equal(input.startDate, null);
    assert.equal(input.endDate, null);
  });

  it('refuses bad seconds, dates, position, text', () => {
    const bad = [
      { ...VALID, autoHideSeconds: 0 },
      { ...VALID, autoHideSeconds: 3601 },
      { ...VALID, autoHideSeconds: 2.5 },
      { ...VALID, startDate: '2026-02-30' },
      { ...VALID, startDate: '2026-12-01', endDate: '2026-11-30' },
      { ...VALID, position: 'LEFT' },
      { ...VALID, messageText: 'x'.repeat(257) },
      { ...VALID, messageText: '   ' },
      { ...VALID, isActive: 'yes' },
      null,
    ];
    for (const value of bad) assert.throws(() => validateFloatMessageInput(value), FloatMessageInputError, JSON.stringify(value));
  });

  it('an empty text may be saved while switched off', () => {
    assert.equal(validateFloatMessageInput({ ...VALID, isActive: false, messageText: '' }).messageText, '');
  });
});

describe('isFloatMessageShownOn / publicFloatMessageOf', () => {
  const settings: FloatMessageSettings = { ...DEFAULT_FLOAT_MESSAGE, ...validateFloatMessageInput(VALID), updatedAt: '2026-11-17 10:00:00+07' };

  it('shown inside the date range, both ends included', () => {
    assert.equal(isFloatMessageShownOn(settings, '2026-11-17'), true);
    assert.equal(isFloatMessageShownOn(settings, '2026-11-30'), true);
    assert.equal(isFloatMessageShownOn(settings, '2026-11-16'), false);
    assert.equal(isFloatMessageShownOn(settings, '2026-12-01'), false);
  });

  it('not shown when switched off or without text; no dates = every day', () => {
    assert.equal(isFloatMessageShownOn({ ...settings, isActive: false }, '2026-11-20'), false);
    assert.equal(isFloatMessageShownOn({ ...settings, messageText: ' ' }, '2026-11-20'), false);
    assert.equal(isFloatMessageShownOn({ ...settings, endDate: null, startDate: null }, '2030-01-01'), true);
  });

  it('public view carries only what the box needs, versioned by the last save', () => {
    assert.deepEqual(publicFloatMessageOf(settings, '2026-11-20'), {
      autoHideSeconds: 10,
      dismissible: true,
      highlightBorder: false,
      openInNewTab: false,
      position: 'BOTTOM_RIGHT',
      text: 'Bảo trì hệ thống lúc 20:00',
      url: null,
      version: '2026-11-17 10:00:00+07',
    });
    assert.equal(publicFloatMessageOf(settings, '2026-12-05'), null);
  });
});

describe('bottom-right slot', () => {
  it('is busy while any notice holds it and tells subscribers', () => {
    let calls = 0;
    const unsubscribe = subscribeBottomRightSlot(() => { calls += 1; });
    assert.equal(isBottomRightSlotBusy(), false);
    const releaseA = claimBottomRightSlot('a');
    const releaseB = claimBottomRightSlot('b');
    assert.equal(isBottomRightSlotBusy(), true);
    releaseA();
    releaseA(); // a second release is a no-op
    assert.equal(isBottomRightSlotBusy(), true);
    releaseB();
    assert.equal(isBottomRightSlotBusy(), false);
    assert.equal(calls, 4);
    unsubscribe();
  });
});

describe('FloatMessageQueue — priority (#1 Tạo cache, #2 My assigned tasks, #3 Superadmin config) & 2s gap', () => {
  it('enforces priority order (#1 → #2 → #3), 10s timeout + dismissible on non-admin messages, and 2s wait between messages', () => {
    const { advance, timers } = createFakeClock();
    const queue = new FloatMessageQueue(timers);

    // Giữ chỗ kiểm tra lúc khởi động trang để #3 không nhảy ra trước khi #1 và #2 kịp vào hàng đợi
    const releaseCacheCheck = queue.holdCheck('cache-init', FLOAT_MESSAGE_PRIORITY.CACHE);
    const releaseAssignedCheck = queue.holdCheck('assigned-init', FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS);

    // Đưa vào theo thứ tự ngược: #3 trước, rồi #2, rồi #1
    queue.enqueue({
      id: 'system-config',
      priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG,
      text: 'Thông báo hệ thống từ Superadmin',
      autoHideSeconds: 25,
      dismissible: false,
    });
    assert.equal(queue.getSnapshot().active, null);

    queue.enqueue({
      id: 'assigned-tasks',
      priority: FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS,
      text: 'TASK: Bạn có 3 epic được giao task!',
      autoHideSeconds: 99, // sẽ bị ép về 10s
      dismissible: false,  // sẽ bị ép về true
    });
    releaseAssignedCheck();
    // Vẫn đang chờ kiểm tra #1 hoàn tất
    assert.equal(queue.getSnapshot().active, null);

    queue.enqueue({
      id: 'cache-1',
      priority: FLOAT_MESSAGE_PRIORITY.CACHE,
      text: 'Hệ thống đang tính toán lại cache',
      autoHideSeconds: 5, // sẽ bị ép về 10s
      dismissible: false, // sẽ bị ép về true
    });
    releaseCacheCheck();

    // 1. Ưu tiên #1 (Tạo cache) hiển thị đầu tiên, luôn có timeout = 10s và dismissible = true
    const first = queue.getSnapshot().active;
    assert.ok(first);
    assert.equal(first.id, 'cache-1');
    assert.equal(first.autoHideSeconds, NON_ADMIN_FLOAT_TIMEOUT_SECONDS);
    assert.equal(first.dismissible, true);

    // Chạy 9.9 giây: #1 vẫn đang hiển thị
    advance(9900);
    assert.equal(queue.getSnapshot().active?.id, 'cache-1');

    // Đủ 10 giây: #1 hết timeout -> chuyển sang 2 giây thời gian chờ (coolingDown = true, active = null)
    advance(100);
    assert.equal(queue.getSnapshot().active, null);
    assert.equal(queue.getSnapshot().coolingDown, true);

    // Sau 1.9 giây chờ: vẫn chưa hiện #2
    advance(1900);
    assert.equal(queue.getSnapshot().active, null);

    // Đủ 2 giây chờ (FLOAT_MESSAGE_GAP_MS = 2000): Ưu tiên #2 (My assigned tasks) hiển thị!
    advance(100);
    const second = queue.getSnapshot().active;
    assert.ok(second);
    assert.equal(second.id, 'assigned-tasks');
    assert.equal(second.autoHideSeconds, NON_ADMIN_FLOAT_TIMEOUT_SECONDS);
    assert.equal(second.dismissible, true);

    // Giả sử sau 3 giây người dùng bấm nút 'x' tắt #2 sớm:
    advance(3000);
    queue.dismissActive('assigned-tasks');
    assert.equal(queue.getSnapshot().active, null);
    assert.equal(queue.getSnapshot().coolingDown, true);

    // Trước khi đủ 2 giây chờ sau khi tắt: #3 chưa hiện
    advance(FLOAT_MESSAGE_GAP_MS - 100);
    assert.equal(queue.getSnapshot().active, null);

    // Đủ 2 giây chờ sau khi tắt #2: #3 (nội dung cấu hình của SUPERADMIN) hiển thị cuối cùng, giữ nguyên cấu hình riêng
    advance(100);
    const third = queue.getSnapshot().active;
    assert.ok(third);
    assert.equal(third.id, 'system-config');
    assert.equal(third.autoHideSeconds, 25);
    assert.equal(third.dismissible, false);
  });

  it('preempts an active SYSTEM_CONFIG (#3) message when a higher-priority (#1 or #2) message arrives later', () => {
    const { advance, timers } = createFakeClock();
    const queue = new FloatMessageQueue(timers);

    // #3 đang hiển thị ở chế độ "Luôn hiển thị" (autoHideSeconds = null)
    queue.enqueue({
      id: 'system-config',
      priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG,
      text: 'Thông báo cố định của Superadmin',
      autoHideSeconds: null,
      dismissible: true,
    });
    assert.equal(queue.getSnapshot().active?.id, 'system-config');

    // Một thông báo Tạo cache (#1) xuất hiện sau đó
    queue.enqueue({
      id: 'cache-done',
      priority: FLOAT_MESSAGE_PRIORITY.CACHE,
      text: 'Tạo Cache hoàn thành',
    });

    // #3 tạm nhường chỗ, chờ 2s rồi hiển thị #1
    assert.equal(queue.getSnapshot().active, null);
    assert.equal(queue.getSnapshot().coolingDown, true);

    advance(FLOAT_MESSAGE_GAP_MS);
    assert.equal(queue.getSnapshot().active?.id, 'cache-done');

    // Sau khi #1 hết 10s timeout + 2s chờ, #3 hiển thị trở lại ở cuối hàng đợi
    advance(NON_ADMIN_FLOAT_TIMEOUT_SECONDS * 1000 + FLOAT_MESSAGE_GAP_MS);
    assert.equal(queue.getSnapshot().active?.id, 'system-config');
  });
});

describe('URL, new tab and highlight border (REQ-20261118-04)', () => {
  it('accepts http(s) URLs and internal paths, trims them', () => {
    assert.equal(normalizeFloatMessageUrl(' https://example.com/a?b=1 '), 'https://example.com/a?b=1');
    assert.equal(normalizeFloatMessageUrl('http://localhost:3000/x'), 'http://localhost:3000/x');
    assert.equal(normalizeFloatMessageUrl('/epic-alerts-15?markFilter=MINE'), '/epic-alerts-15?markFilter=MINE');
  });

  it('refuses anything that is not a URL', () => {
    for (const bad of ['', 'abc', 'example.com', 'javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', '//evil.com', '/a\\b', 'https://', 'https://a b.com', `https://x.com/${'a'.repeat(2050)}`]) {
      assert.equal(normalizeFloatMessageUrl(bad), null, bad);
    }
  });

  it('validateFloatMessageInput: defaults, trimmed URL, rejects a bad URL, new tab only with a URL', () => {
    const plain = validateFloatMessageInput(VALID);
    assert.equal(plain.url, null);
    assert.equal(plain.openInNewTab, false);
    assert.equal(plain.highlightBorder, false);
    const full = validateFloatMessageInput({ ...VALID, highlightBorder: true, openInNewTab: true, url: ' https://example.com ' });
    assert.equal(full.url, 'https://example.com');
    assert.equal(full.openInNewTab, true);
    assert.equal(full.highlightBorder, true);
    assert.equal(validateFloatMessageInput({ ...VALID, openInNewTab: true, url: '' }).openInNewTab, false);
    assert.equal(validateFloatMessageInput({ ...VALID, url: '   ' }).url, null);
    for (const bad of [{ url: 'abc' }, { url: 'javascript:alert(1)' }, { url: 5 }, { openInNewTab: 'yes' }, { highlightBorder: 1 }]) {
      assert.throws(() => validateFloatMessageInput({ ...VALID, ...bad }), FloatMessageInputError, JSON.stringify(bad));
    }
  });

  it('the public view carries url, openInNewTab and highlightBorder', () => {
    const settings: FloatMessageSettings = { ...DEFAULT_FLOAT_MESSAGE, ...validateFloatMessageInput({ ...VALID, highlightBorder: true, openInNewTab: true, url: '/x' }), updatedAt: 'v1' };
    const view = publicFloatMessageOf(settings, '2026-11-20');
    assert.equal(view?.url, '/x');
    assert.equal(view?.openInNewTab, true);
    assert.equal(view?.highlightBorder, true);
  });
});

describe('priorities and the list (REQ-20261118-04)', () => {
  it('priorities must be one digit 1..8 for FM-001 and FM-002', () => {
    assert.deepEqual(validateFloatMessagePriorities({ 'FM-001': 3, 'FM-002': 1 }), { 'FM-001': 3, 'FM-002': 1 });
    for (const bad of [{ 'FM-001': 0, 'FM-002': 1 }, { 'FM-001': 9, 'FM-002': 1 }, { 'FM-001': 1.5, 'FM-002': 1 }, { 'FM-001': '1', 'FM-002': 1 }, { 'FM-001': 1 }, null]) {
      assert.throws(() => validateFloatMessagePriorities(bad), FloatMessageInputError, JSON.stringify(bad));
    }
  });

  it('list: by priority, ties by code A-Z, the SUPERADMIN message always last', () => {
    assert.deepEqual(buildFloatMessageList('Hi', DEFAULT_FLOAT_MESSAGE_PRIORITIES).map((row) => [row.code, row.priority]), [['FM-001', 1], ['FM-002', 2], ['FM-003', 9]]);
    assert.deepEqual(buildFloatMessageList('Hi', { 'FM-001': 5, 'FM-002': 2 }).map((row) => row.code), ['FM-002', 'FM-001', 'FM-003']);
    assert.deepEqual(buildFloatMessageList('Hi', { 'FM-001': 4, 'FM-002': 4 }).map((row) => row.code), ['FM-001', 'FM-002', 'FM-003']);
    const last = buildFloatMessageList('  ', { 'FM-001': 8, 'FM-002': 8 }).at(-1);
    assert.equal(last?.code, 'FM-003');
    assert.equal(last?.editable, false);
    assert.equal(last?.text, '(Chưa cấu hình nội dung)');
  });

  it('queue follows the configured priorities, ties by code', () => {
    const clock = createFakeClock();
    const queue = new FloatMessageQueue(clock.timers);
    queue.setKindRanks({ assignedTasks: 1, cache: 3 });
    const releaseCheck = queue.holdCheck('tasks-check', FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS);
    queue.enqueue({ id: 'c', priority: FLOAT_MESSAGE_PRIORITY.CACHE, text: 'cache' });
    queue.enqueue({ id: 's', priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG, text: 'sys' });
    queue.enqueue({ id: 't', priority: FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS, text: 'task' });
    releaseCheck();
    assert.equal(queue.getSnapshot().active?.id, 't');
    queue.dismissActive();
    clock.advance(FLOAT_MESSAGE_GAP_MS);
    assert.equal(queue.getSnapshot().active?.id, 'c');
    queue.dismissActive();
    clock.advance(FLOAT_MESSAGE_GAP_MS);
    assert.equal(queue.getSnapshot().active?.id, 's');

    const tie = new FloatMessageQueue(clock.timers);
    tie.setKindRanks({ assignedTasks: 2, cache: 2 });
    const releaseTie = tie.holdCheck('y', FLOAT_MESSAGE_PRIORITY.CACHE);
    tie.enqueue({ id: 't', priority: FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS, text: 'task' });
    tie.enqueue({ id: 'c', priority: FLOAT_MESSAGE_PRIORITY.CACHE, text: 'cache' });
    releaseTie();
    assert.equal(tie.getSnapshot().active?.id, 'c');
  });

  it('highlightBorder: always for My assigned tasks, by setting for the SUPERADMIN message', () => {
    const queue = new FloatMessageQueue(createFakeClock().timers);
    assert.equal(queue.enqueue({ priority: FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS, text: 'a' })?.highlightBorder, true);
    assert.equal(queue.enqueue({ priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG, text: 'b' })?.highlightBorder, false);
    assert.equal(queue.enqueue({ highlightBorder: true, priority: FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG, text: 'c' })?.highlightBorder, true);
  });
});
