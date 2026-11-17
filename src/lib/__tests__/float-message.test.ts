import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { claimBottomRightSlot, isBottomRightSlotBusy, subscribeBottomRightSlot } from '../bottom-right-slot';
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
