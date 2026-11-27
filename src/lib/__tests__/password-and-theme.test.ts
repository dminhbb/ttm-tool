import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateCompliantPassword, PASSWORD_MAX_LENGTH, validatePassword } from '../password-rules';
import { THEME_CHOICES, themeAttributesOf, THEME_BRAND_INIT_SCRIPT } from '../theme-brand';

describe('Rule mật khẩu (2026-11-27): chỉ cần tối thiểu 5 ký tự', () => {
  it('5 ký tự bất kỳ là hợp lệ, 4 ký tự hoặc trống thì không', () => {
    for (const value of ['abcde', '12345', 'Ab!12']) assert.equal(validatePassword(value).isValid, true, value);
    for (const value of ['', 'abcd']) assert.equal(validatePassword(value).isValid, false, value);
    assert.equal(validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1)).isValid, false);
  });

  it('mật khẩu ngẫu nhiên giữ logic cũ: 10 ký tự, có chữ hoa, chữ thường, số và ký tự biểu tượng', () => {
    for (let index = 0; index < 20; index += 1) {
      const password = generateCompliantPassword();
      assert.equal(password.length, 10);
      for (const pattern of [/[A-Z]/, /[a-z]/, /\d/, /[^a-zA-Z0-9]/]) assert.match(password, pattern);
    }
  });
});

describe('MB Theme', () => {
  it('là IAS + data-skin="mb"; các theme khác không có skin', () => {
    assert.deepEqual(themeAttributesOf('mb'), { brand: 'ias', skin: 'mb' });
    for (const choice of THEME_CHOICES.filter((item) => item !== 'mb')) assert.deepEqual(themeAttributesOf(choice), { brand: choice, skin: null });
  });

  it('script chạy trước khi vẽ trang áp đúng thuộc tính cho theme đã lưu', () => {
    const run = (stored: string) => {
      const attributes = new Map<string, string>();
      const store = new Map<string, string>([['ttm-theme-brand', stored], ['ttm-theme-brand-timestamp', String(Date.now())]]);
      const localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) };
      const document = { documentElement: { setAttribute: (key: string, value: string) => attributes.set(key, value), classList: { add() {}, remove() {} } } };
      new Function('localStorage', 'document', THEME_BRAND_INIT_SCRIPT)(localStorage, document);
      return [attributes.get('data-brand'), attributes.get('data-skin') ?? null];
    };
    assert.deepEqual(run('mb'), ['ias', 'mb']);
    assert.deepEqual(run('pink'), ['pink', null]);
    assert.deepEqual(run('khac'), ['ias', null]);
  });
});
