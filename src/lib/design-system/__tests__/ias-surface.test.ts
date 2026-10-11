/**
 * Task 6 — khoá spec Card, Status (dot+pill) và Tag.
 *
 * Nguồn: references/components/display/card.md · dcard.md · badge-tag.md
 *        + templates/.../DanhSachChuongTrinh.dc.html (.status.st-*)
 *
 * Việc test này canh quan trọng nhất: trước đây app có ≥5 implementation Card song
 * song với radius 24 / 16 / 14 / rounded-xl trên CÙNG một màn hình. Khoá radius và
 * mặt card về một giá trị duy nhất là cách chặn việc đó quay lại.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { collectDeclarations, declarationsFor, resolveToken } from '../css-tokens';

const SRC_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const APP_DIR = path.join(SRC_DIR, 'app');
const GLOBALS_CSS = readFileSync(path.join(APP_DIR, 'globals.css'), 'utf8');
const IAS_TOKENS_CSS = readFileSync(path.join(APP_DIR, 'ias-tokens.css'), 'utf8');

const declaredTokens = collectDeclarations([IAS_TOKENS_CSS, GLOBALS_CSS], 'ias');
const resolve = (token: string) => resolveToken(token, declaredTokens);
const resolveValue = (value: string) =>
  value.replace(/var\((--[\w-]+)\)/g, (_, token) => resolve(token));

describe('Card IAS', () => {
  for (const selector of [
    '.ias-card',
    ':root[data-brand="ias"] .ui-card',
    ':root[data-brand="ias"] .ui-alert',
  ]) {
    it(`${selector}: trắng, viền 1px border-default, radius 12, KHÔNG shadow`, () => {
      const d = declarationsFor(GLOBALS_CSS, selector);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), '#ffffff');
      assert.equal(resolveValue(d.get('border') ?? '').toLowerCase(), '1px solid #d9dbe9');
      assert.equal(resolveValue(d.get('border-radius') ?? ''), '12px');
      assert.equal(
        d.get('box-shadow'),
        'none',
        'card.md: shadow đã bị bỏ từ 2026-07-31, thay bằng viền — không xếp lớp cả hai',
      );
    });
  }

  it('một radius card duy nhất — không còn thang 24px của brand wise', () => {
    // Trước đây .ui-card dùng var(--radius-xl) = 24px (shape language của Wise),
    // cạnh đó là rounded-2xl / rounded-[14px] / rounded-[16px] tự dựng trong dashboard.
    for (const token of ['--radius-lg', '--radius-xl', '--radius-2xl']) {
      assert.equal(resolve(token), '12px', `${token} phải là 12px`);
    }
    assert.equal(resolve('--ias-radius-card'), '12px');
  });

  it('header 16px 20px, title 14px/600', () => {
    const header = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-card-header');
    assert.equal(header.get('padding'), '16px 20px');

    const title = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-card-title');
    assert.equal(resolveValue(title.get('font-size') ?? ''), '14px');
    assert.equal(resolveValue(title.get('font-weight') ?? ''), '600');
  });

  it('body có padding trên khi đứng một mình, bỏ padding trên khi theo sau header', () => {
    // dcard.md quy định `0 20px 20px`, nhưng rất nhiều card trong app dùng body
    // không kèm header — padding-top: 0 ở đó sẽ dán nội dung vào viền.
    const body = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-card-body');
    assert.equal(body.get('padding'), '16px 20px 20px');

    const afterHeader = declarationsFor(
      GLOBALS_CSS,
      ':root[data-brand="ias"] .ui-card-header + .ui-card-body',
    );
    assert.equal(afterHeader.get('padding-top'), '0');
  });
});

describe('Status IAS — dot + pill + nhãn', () => {
  const STATUS_SPECS: { className: string; bg: string; text: string; dot?: string }[] = [
    { className: '.ias-status-blue', bg: '#f4f5ff', text: '#141ed2' },
    { className: '.ias-status-success', bg: '#f2fffb', text: '#00966d', dot: '#00ba88' },
    { className: '.ias-status-warning', bg: '#fff9ef', text: '#946200', dot: '#f4b740' },
    { className: '.ias-status-error', bg: '#fff3f8', text: '#c30052', dot: '#eb2d4b' },
    { className: '.ias-status-neutral', bg: '#f4f6fa', text: '#6e7191', dot: '#a0a3bd' },
    { className: '.ias-status-purple', bg: '#eedfff', text: '#5500cc', dot: '#7b61ff' },
  ];

  it('base: 11px/600, radius 4, padding 3px 10px, không co lại', () => {
    const d = declarationsFor(GLOBALS_CSS, '.ias-status');
    assert.equal(d.get('font-size'), '11px');
    assert.equal(resolveValue(d.get('font-weight') ?? ''), '600');
    assert.equal(resolveValue(d.get('border-radius') ?? ''), '4px');
    assert.equal(d.get('padding'), '3px 10px');
    assert.equal(d.get('white-space'), 'nowrap');
    assert.equal(d.get('flex-shrink'), '0');
  });

  it('dot luôn có mặt qua ::before, 6px, tròn', () => {
    const d = declarationsFor(GLOBALS_CSS, '.ias-status::before');
    assert.equal(d.get('content'), "''");
    assert.equal(d.get('width'), '6px');
    assert.equal(d.get('height'), '6px');
    assert.equal(d.get('border-radius'), '50%');
  });

  for (const spec of STATUS_SPECS) {
    it(`${spec.className}: nền + chữ + dot đúng hex IAS`, () => {
      const d = declarationsFor(GLOBALS_CSS, spec.className);
      assert.equal(resolveValue(d.get('background') ?? '').toLowerCase(), spec.bg);
      assert.equal(resolveValue(d.get('color') ?? '').toLowerCase(), spec.text);

      if (spec.dot) {
        const dotRule = declarationsFor(GLOBALS_CSS, `${spec.className}::before`);
        assert.equal(resolveValue(dotRule.get('background') ?? '').toLowerCase(), spec.dot);
      } else {
        // st-blue dùng chính màu chữ làm dot (currentColor từ `.ias-status::before`).
        assert.equal(declarationsFor(GLOBALS_CSS, `${spec.className}::before`).size, 0);
      }
    });
  }

  it('đủ 6 trạng thái như template IAS', () => {
    assert.equal(STATUS_SPECS.length, 6);
    for (const spec of STATUS_SPECS) {
      assert.ok(
        declarationsFor(GLOBALS_CSS, spec.className).size > 0,
        `thiếu ${spec.className}`,
      );
    }
  });
});

describe('Tag IAS — chip phân loại', () => {
  it('viên thuốc, có viền, KHÔNG dot', () => {
    const d = declarationsFor(GLOBALS_CSS, '.ias-tag');
    assert.equal(resolveValue(d.get('border-radius') ?? ''), '9999px');
    assert.match(resolveValue(d.get('border') ?? ''), /^1px solid #/);
    // badge-tag.md: Tag "no leading dot" — đây là điểm phân biệt với Badge.
    assert.equal(declarationsFor(GLOBALS_CSS, '.ias-tag::before').size, 0);
  });

  it('Badge mặc định chữ nhật 4px — ngược lại với Tag', () => {
    // badge-tag.md, đảo mặc định từ 2026-09-15: Badge rectangle, Tag pill.
    const badge = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-badge');
    assert.equal(resolveValue(badge.get('border-radius') ?? ''), '4px');

    const badgePill = declarationsFor(GLOBALS_CSS, ':root[data-brand="ias"] .ui-badge-pill');
    assert.equal(resolveValue(badgePill.get('border-radius') ?? ''), '9999px');
  });
});

describe('Badge.tsx giữ API cũ, thêm prop mới không phá vỡ', () => {
  const BADGE_TSX = readFileSync(path.join(SRC_DIR, 'components', 'ui', 'Badge.tsx'), 'utf8');

  it('vẫn nhận đủ 7 variant như trước', () => {
    for (const variant of [
      'success',
      'danger',
      'warning',
      'pending',
      'info',
      'neutral',
      'todo',
    ]) {
      assert.match(BADGE_TSX, new RegExp(`'${variant}'`), `mất variant ${variant}`);
    }
  });

  it('dot mặc định false và shape mặc định rectangle', () => {
    // dot=false để không gắn dot vào các Badge đang làm chip đếm/mã (theo IAS là Tag).
    assert.match(BADGE_TSX, /dot\s*=\s*false/);
    assert.match(BADGE_TSX, /shape\s*=\s*'rectangle'/);
  });

  it('phát class ui-badge-dot / ui-badge-pill tương ứng', () => {
    assert.match(BADGE_TSX, /ui-badge-dot/);
    assert.match(BADGE_TSX, /ui-badge-pill/);
  });
});
