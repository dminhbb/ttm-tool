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
  DEFAULT_FLOAT_MESSAGE,
  FloatMessageInputError,
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
      position: 'BOTTOM_RIGHT',
      text: 'Bảo trì hệ thống lúc 20:00',
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
