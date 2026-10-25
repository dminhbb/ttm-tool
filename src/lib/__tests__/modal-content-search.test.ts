import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseModalSearchQuery, buildSearchRegex } from '../modal-content-search';

describe('ModalContentSearch — parseModalSearchQuery', () => {
  it('handles empty or whitespace-only queries', () => {
    assert.deepEqual(parseModalSearchQuery(''), { mode: 'words', terms: [] });
    assert.deepEqual(parseModalSearchQuery('   '), { mode: 'words', terms: [] });
  });

  it('detects exact phrase in single quotes', () => {
    assert.deepEqual(parseModalSearchQuery("'abc xyz'"), { mode: 'exact', terms: ['abc xyz'] });
    assert.deepEqual(parseModalSearchQuery("  'Scoring Service'  "), { mode: 'exact', terms: ['Scoring Service'] });
  });

  it('detects exact phrase in double quotes', () => {
    assert.deepEqual(parseModalSearchQuery('"abc xyz"'), { mode: 'exact', terms: ['abc xyz'] });
    assert.deepEqual(parseModalSearchQuery('  "Finding Groups"  '), { mode: 'exact', terms: ['Finding Groups'] });
  });

  it('detects exact phrase in parentheses', () => {
    assert.deepEqual(parseModalSearchQuery('(abc xyz)'), { mode: 'exact', terms: ['abc xyz'] });
  });

  it('detects exact phrase with plus separator', () => {
    assert.deepEqual(parseModalSearchQuery('abc+xyz'), { mode: 'exact', terms: ['abc xyz'] });
    assert.deepEqual(parseModalSearchQuery('abc + xyz'), { mode: 'exact', terms: ['abc xyz'] });
    assert.deepEqual(parseModalSearchQuery('Scoring+Service+Epic'), { mode: 'exact', terms: ['Scoring Service Epic'] });
  });

  it('detects multiple individual words when not quoted or joined by plus', () => {
    assert.deepEqual(parseModalSearchQuery('abc xyz'), { mode: 'words', terms: ['abc', 'xyz'] });
    assert.deepEqual(parseModalSearchQuery('  Scoring   Service   Epic  '), {
      mode: 'words',
      terms: ['Scoring', 'Service', 'Epic'],
    });
  });

  it('handles single word queries', () => {
    assert.deepEqual(parseModalSearchQuery('Scoring'), { mode: 'words', terms: ['Scoring'] });
  });
});

describe('ModalContentSearch — buildSearchRegex', () => {
  it('returns null for empty queries', () => {
    assert.equal(buildSearchRegex(''), null);
    assert.equal(buildSearchRegex('   '), null);
  });

  it('matches exact phrase case-insensitively and handles whitespace variations', () => {
    const regex1 = buildSearchRegex("'abc xyz'")!;
    assert.ok(regex1 instanceof RegExp);
    assert.ok(regex1.test('Đây là abc xyz ở giữa'));
    regex1.lastIndex = 0;
    assert.ok(regex1.test('ABC   XYZ viết hoa'));
    regex1.lastIndex = 0;
    assert.ok(!regex1.test('abc rồi xyz cách xa nhau'));

    const regex2 = buildSearchRegex('abc+xyz')!;
    assert.ok(regex2.test('chuỗi abc xyz'));
    regex2.lastIndex = 0;
    assert.ok(!regex2.test('chỉ có abc'));
  });

  it('matches any individual word in multi-word query', () => {
    const regex = buildSearchRegex('Scoring Service')!;
    assert.ok(regex.test('Chỉ có chữ Scoring'));
    regex.lastIndex = 0;
    assert.ok(regex.test('Chỉ có chữ Service'));
    regex.lastIndex = 0;
    assert.ok(regex.test('Cả hai Scoring và Service'));
    regex.lastIndex = 0;
    assert.ok(!regex.test('Không chứa từ nào'));
  });

  it('escapes special regex characters safely', () => {
    const regex = buildSearchRegex('TTM-CNTT (QLDA)')!;
    assert.ok(regex.test('Đánh giá TTM-CNTT'));
    regex.lastIndex = 0;
    assert.ok(regex.test('Chỉ có (QLDA)'));

    const exactRegex = buildSearchRegex("'TTM-CNTT (QLDA)'")!;
    assert.ok(exactRegex.test('Chuỗi TTM-CNTT (QLDA) chuẩn'));
    exactRegex.lastIndex = 0;
    assert.ok(!exactRegex.test('TTM-CNTT riêng'));
  });
});
