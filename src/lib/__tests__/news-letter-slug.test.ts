import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newsLetterDisplayTitle, newsLetterSlug } from '../news-letter/slug';

test('the slug keeps case, drops Vietnamese accents and turns spaces into underscores', () => {
  assert.equal(newsLetterSlug('Quy định sử dụng AI'), 'Quy_dinh_su_dung_AI');
});

test('the slug keeps existing accent-free text and single underscores', () => {
  assert.equal(newsLetterSlug('Huong dan su dung'), 'Huong_dan_su_dung');
  // đ → d (lower), Đ → D (upper).
  assert.equal(newsLetterSlug('Đồ án BĐS'), 'Do_an_BDS');
});

test('the slug collapses runs of spaces and special characters into one underscore', () => {
  assert.equal(newsLetterSlug('Quy  định   AI'), 'Quy_dinh_AI');
  assert.equal(newsLetterSlug('Hướng-dẫn / (mới)'), 'Huong_dan_moi');
  assert.equal(newsLetterSlug('Số 1 & 2'), 'So_1_2');
});

test('an empty or whitespace-only short title yields an empty slug', () => {
  assert.equal(newsLetterSlug(''), '');
  assert.equal(newsLetterSlug('   '), '');
  assert.equal(newsLetterSlug(null), '');
  assert.equal(newsLetterSlug(undefined), '');
});

test('leading/trailing separators are trimmed off the slug', () => {
  assert.equal(newsLetterSlug('  Quy định AI  '), 'Quy_dinh_AI');
  assert.equal(newsLetterSlug('— Quy định AI —'), 'Quy_dinh_AI');
});

test('the menu title is the short title when set, else the title', () => {
  assert.equal(newsLetterDisplayTitle({ shortTitle: 'Quy định AI', title: 'Tiêu đề đầy đủ rất dài' }), 'Quy định AI');
  assert.equal(newsLetterDisplayTitle({ shortTitle: '', title: 'Tiêu đề đầy đủ' }), 'Tiêu đề đầy đủ');
  assert.equal(newsLetterDisplayTitle({ shortTitle: '   ', title: 'Tiêu đề đầy đủ' }), 'Tiêu đề đầy đủ');
  assert.equal(newsLetterDisplayTitle({ shortTitle: null, title: 'Tiêu đề đầy đủ' }), 'Tiêu đề đầy đủ');
});
