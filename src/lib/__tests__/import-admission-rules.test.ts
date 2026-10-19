import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RawJiraIssue } from '../csv-parser';
import {
  evaluateImportAdmission,
  isReleasedStatus,
  parseEpicKeyList,
  planImportAdmission,
  vietnamIsoDate,
  type AdmissionEpicFacts,
  type AdmissionListEntry,
  type ImportAdmissionSettings,
} from '../import-admission-rules';

const SETTINGS: ImportAdmissionSettings = { createdBefore: '2026-01-31', releasedDueBefore: '2026-07-01' };
const facts = (overrides: Partial<AdmissionEpicFacts>): AdmissionEpicFacts => ({
  createdDate: '2026-03-01', dueDate: null, issueType: 'Epic', r4gDate: null, status: 'In Progress', statusChangedDate: null, ...overrides,
});
const codes = (overrides: Partial<AdmissionEpicFacts>, settings = SETTINGS) => evaluateImportAdmission(facts(overrides), settings).map((v) => v.code);

const row = (overrides: Partial<RawJiraIssue>): RawJiraIssue => ({
  assignee: '', components: '', dueDate: '', epicLink: '', epicName: '', epicStatus: '', epicType: '', ideaApprovedDate: '',
  issueId: '', issueKey: '', issueType: 'Epic', parentId: '', projectKey: '', projectName: '', r4gDate: '', requirementLevel: '',
  rowNumber: 0, startDate: '', status: 'In Progress', summary: '', jiraCreatedAt: '2026-03-01', ...overrides,
});
const isoDate = (raw: string) => (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null);

describe('"Từ chối import" — automatic rules', () => {
  it('denies a level-1 issue type other than Epic (CTNB, YCPT…)', () => {
    assert.deepEqual(codes({ issueType: 'CTNB' }), ['NOT_EPIC_TYPE']);
    assert.deepEqual(codes({ issueType: 'EPIC' }), []);
  });

  it('A: denies an Epic created strictly before A', () => {
    assert.deepEqual(codes({ createdDate: '2026-01-30' }), ['CREATED_BEFORE']);
    assert.deepEqual(codes({ createdDate: '2026-01-31' }), []);
    assert.deepEqual(codes({ createdDate: null }), []);
  });

  it('B: denies only Released / MVP Done, by Due Date before B (30/06 denied, 01/07 kept)', () => {
    assert.deepEqual(codes({ dueDate: '2026-06-30', status: 'Released' }), ['RELEASED_BEFORE']);
    assert.deepEqual(codes({ dueDate: '2026-06-30', status: 'MVP DONE' }), ['RELEASED_BEFORE']);
    assert.deepEqual(codes({ dueDate: '2026-07-01', status: 'Released' }), []);
    assert.deepEqual(codes({ dueDate: '2026-04-01', status: 'In Progress' }), []);
  });

  it('B: falls back to the R4G Date when Due Date is empty (WM-27125), and prefers the status-change date when exported', () => {
    assert.deepEqual(codes({ r4gDate: '2026-04-16', status: 'Released' }), ['RELEASED_BEFORE']);
    assert.deepEqual(codes({ status: 'Released' }), []);
    assert.deepEqual(codes({ dueDate: '2026-05-14', status: 'Released', statusChangedDate: '2026-09-10' }), []);
  });

  it('B: never denies an Epic the database saw in another status on/after B (DL-65580: due 25/06, Released 10/09)', () => {
    assert.deepEqual(codes({ dueDate: '2026-06-25', lastUnreleasedSeenDate: '2026-09-09', status: 'Released' }), []);
    assert.deepEqual(codes({ dueDate: '2026-06-25', lastUnreleasedSeenDate: '2026-07-01', status: 'Released' }), []);
    assert.deepEqual(codes({ dueDate: '2026-06-25', lastUnreleasedSeenDate: '2026-06-30', status: 'Released' }), ['RELEASED_BEFORE']);
  });

  it('B: the history exemption also applies while planning a file', () => {
    const plan = planImportAdmission([row({ dueDate: '2026-06-25', issueKey: 'DL-65580', status: 'Released' })], new Map(), SETTINGS, isoDate, new Map([['DL-65580', '2026-09-09']]));
    assert.deepEqual(plan.deniedEpics, []);
  });

  it('B: an Epic let in only by the history is reported for "Cho phép import" (AUTO_EXEMPT) so the proof can age out (2026-10-19)', () => {
    const rows = [
      row({ dueDate: '2026-06-25', issueKey: 'DL-65580', status: 'Released' }),
      row({ dueDate: '2026-08-01', issueKey: 'DL-2', status: 'Released' }), // after B — no exemption needed
      row({ dueDate: '2026-06-25', issueKey: 'DL-3', jiraCreatedAt: '2026-01-02', status: 'Released' }), // denied by A anyway
    ];
    const proof = new Map([['DL-65580', '2026-09-09'], ['DL-3', '2026-09-09']]);
    const plan = planImportAdmission(rows, new Map(), SETTINGS, isoDate, proof);
    assert.deepEqual(plan.provenExemptEpics.map((epic) => epic.epicKey), ['DL-65580']);
    assert.match(plan.provenExemptEpics[0].reason, /Miễn rule B.*09\/09\/2026/);
    assert.deepEqual(plan.deniedEpics.map((epic) => epic.epicKey), ['DL-3']);
    // Once listed with "Cho phép import" it is neither denied nor reported again — the proof is no longer needed.
    const listed = planImportAdmission(rows.slice(0, 1), new Map([['DL-65580', { allowImport: true }]]), SETTINGS, isoDate, new Map());
    assert.deepEqual([listed.deniedEpics, listed.provenExemptEpics], [[], []]);
  });

  it('a null A/B turns its rule off', () => {
    assert.deepEqual(codes({ createdDate: '2025-01-01', dueDate: '2026-01-01', status: 'Released' }, { createdBefore: null, releasedDueBefore: null }), []);
  });

  it('recognises every spelling of Released / MVP Done', () => {
    for (const status of ['Released', 'RELEASED', 'MVP Done', 'MVP DONE', 'MVPDONE', ' mvp  done ']) assert.ok(isReleasedStatus(status), status);
    assert.ok(!isReleasedStatus('R4GOLIVE'));
  });

  it('reads the Vietnam calendar day of an instant', () => {
    assert.equal(vietnamIsoDate(new Date('2026-06-30T18:00:00Z')), '2026-07-01');
    assert.equal(vietnamIsoDate(null), null);
  });
});

describe('"Từ chối import" — planning an import file', () => {
  const rows = [
    row({ issueKey: 'AC-1', status: 'Released', dueDate: '2026-05-01' }),
    row({ epicLink: 'AC-1', issueKey: 'AC-2', issueType: 'Story' }),
    row({ epicLink: 'AC-1', issueKey: 'AC-3', issueType: 'Sub-task', parentId: 'AC-2' }),
    row({ issueKey: 'AC-10' }),
    row({ epicLink: 'AC-10', issueKey: 'AC-11', issueType: 'Story' }),
    row({ epicLink: 'LST-1', issueKey: 'LST-2', issueType: 'Story', issueId: '9001' }),
    row({ issueKey: 'LST-3', issueType: 'BA', parentId: '9001' }),
  ];

  it('drops the whole branch of a rule-denied Epic and of a listed Epic, keeps the rest', () => {
    const list = new Map<string, AdmissionListEntry>([['LST-1', { allowImport: false }]]);
    const plan = planImportAdmission(rows, list, SETTINGS, isoDate);
    assert.deepEqual(plan.admitted.map((r) => r.issueKey), ['AC-10', 'AC-11']);
    assert.equal(plan.deniedRowCount, 5);
    assert.deepEqual(plan.deniedEpics.map((e) => [e.epicKey, e.origin]), [['LST-1', 'LIST'], ['AC-1', 'RULE']]);
  });

  it('"Cho phép import" exempts an Epic from the rules', () => {
    const list = new Map<string, AdmissionListEntry>([['AC-1', { allowImport: true }]]);
    const plan = planImportAdmission(rows, list, SETTINGS, isoDate);
    assert.ok(plan.admitted.some((r) => r.issueKey === 'AC-1'));
    assert.deepEqual(plan.deniedEpics, []);
  });

  it('judges a Py Jira API epic row by its exported issue type', () => {
    const plan = planImportAdmission([row({ issueKey: 'YC-1', sourceIssueType: 'YCPT' })], new Map(), SETTINGS, isoDate);
    assert.deepEqual(plan.deniedEpics.map((e) => e.violations.map((v) => v.code)), [['NOT_EPIC_TYPE']]);
  });
});

describe('Epic key input', () => {
  it('splits, upper-cases, dedupes and flags malformed keys', () => {
    assert.deepEqual(parseEpicKeyList('wm-27125, WM-27125;\nAPI-1  bad x-'), { invalid: ['BAD', 'X-'], keys: ['WM-27125', 'API-1'] });
  });
});
