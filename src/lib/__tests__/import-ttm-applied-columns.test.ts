import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePyJiraApi } from '@/lib/adapters/py-jira-api-adapter';
import { mapCSVToRawIssues, parseCSV } from '@/lib/csv-parser';
import { ttmAppliedColumnsOf } from '@/lib/import-ttm-applied-columns';

describe('TTM-applied / except-TTM-plan column presence (2026-10-27)', () => {
  it('a file without the columns says nothing about them — the importer keeps the old value and the black list', () => {
    const { headers } = parsePyJiraApi('hierarchy_level,project_key,epic_key,epic_name,epic_status\nepic,WM,WM-4,Epic D,Released');
    assert.deepEqual(ttmAppliedColumnsOf(headers), { hasTtmApplied: false, hasExceptTtmPlan: false });
  });

  it('a column with blank cells is still present ("Theo quy định")', () => {
    const { headers } = parsePyJiraApi('hierarchy_level,project_key,epic_key,epic_name,epic_status,TTM-applied\nepic,WM,WM-5,Epic E,Released,');
    assert.deepEqual(ttmAppliedColumnsOf(headers), { hasTtmApplied: true, hasExceptTtmPlan: false });
  });

  it('accepts every spelling, case-insensitive and trimmed', () => {
    assert.deepEqual(ttmAppliedColumnsOf([' ttm-APPLIED ', 'Epic_Except_TTM_Plan']), { hasTtmApplied: true, hasExceptTtmPlan: true });
    assert.deepEqual(ttmAppliedColumnsOf(['ttm_applied', 'except_ttm_plan']), { hasTtmApplied: true, hasExceptTtmPlan: true });
  });

  it('the Jira UI export adapter reports the same headers', () => {
    const plain = mapCSVToRawIssues(parseCSV('Issue key,Summary,Issue Type,Status\nWM-1,A,Epic,Released'));
    assert.deepEqual(ttmAppliedColumnsOf(plain.headers), { hasTtmApplied: false, hasExceptTtmPlan: false });
    const withColumn = mapCSVToRawIssues(parseCSV('Issue key,Summary,Issue Type,Status,TTM-applied\nWM-1,A,Epic,Released,Không áp dụng'));
    assert.equal(ttmAppliedColumnsOf(withColumn.headers).hasTtmApplied, true);
    assert.equal(withColumn.issues[0].ttmApplied, 'Không áp dụng');
  });
});
