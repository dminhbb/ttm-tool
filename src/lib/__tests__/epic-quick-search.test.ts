import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidEpicSearchKeyword, sanitizeEpicSearchInput } from '../epic-quick-search';

describe('Tìm nhanh Epic — input safety (owner 2026-11-11)', () => {
  it('keeps only letters, digits and "-", capped at 40', () => {
    assert.equal(sanitizeEpicSearchInput("mo-340'; DROP TABLE x;--"), 'mo-340DROPTABLEx--');
    assert.equal(sanitizeEpicSearchInput('<script>alert(1)</script>'), 'scriptalert1script');
    assert.equal(sanitizeEpicSearchInput('MO 34%035_ /x'), 'MO34035x');
    assert.equal(sanitizeEpicSearchInput('Mở-Ếpic'), 'M-pic');
    assert.equal(sanitizeEpicSearchInput('A'.repeat(60)).length, 40);
  });

  it('the API accepts only a 1–40 character keyword of letters / digits / "-" with at least one letter or digit', () => {
    for (const ok of ['MO-', '34035', 'mo-340', 'SMEDS-105834']) assert.equal(isValidEpicSearchKeyword(ok), true, ok);
    for (const bad of ['', '---', 'MO 340', "MO'", 'MO%', 'MO_1', 'A'.repeat(41), 'Mở']) assert.equal(isValidEpicSearchKeyword(bad), false, bad);
  });
});
