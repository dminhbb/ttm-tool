import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scoringNotesOf, viDates } from '@/lib/epic-scoring-notes';
import type { Finding } from '@/lib/scoring/types';

const finding = (badge: string, message: string, extra: Partial<Finding> = {}): Finding => ({ badge, message, evidence: {}, ...extra } as Finding);

describe('Review Notes — tab Scoring (owner 2026-10-28)', () => {
  const findings = [
    finding('PHASE_LATE', 'Pha DESIGN chưa hoàn thành, đã quá baseline 2026-02-04.', { subject: 'DESIGN' }),
    finding('CNTT_PASS', 'Epic hoàn thành TTM-CNTT đúng hạn.'),
    finding('E2E_FAIL', 'Đã vượt ngân sách TTM-E2E.'),
    finding('REC_FILL_IDEA_APPROVED_DATE', 'Bổ sung Idea Approved Date.'),
    finding('CNTT_LATE', 'Cảnh báo muộn (bị che).', { suppressedBy: ['CNTT_PASS'] as Finding['suppressedBy'] }),
    finding('PHASE_DONE', 'Pha DEV đã xong.', { subject: 'DEV' }),
  ];
  const active = ['PHASE_LATE', 'PHASE_LATE:DESIGN', 'CNTT_PASS', 'E2E_FAIL', 'REC_FILL_IDEA_APPROVED_DATE', 'CNTT_LATE'];

  it('keeps the active badges — TTM-CNTT / TTM-E2E verdicts included — with the rule message', () => {
    const notes = scoringNotesOf(findings, active);
    assert.deepEqual(notes.map((note) => note.key), ['E2E_FAIL', 'PHASE_LATE:DESIGN', 'REC_FILL_IDEA_APPROVED_DATE', 'CNTT_PASS']);
    assert.equal(notes[0].label, 'Fail TTM-E2E');
    assert.equal(notes[1].label, 'Trễ pha (DESIGN)');
    assert.equal(notes[1].message, 'Pha DESIGN chưa hoàn thành, đã quá baseline 04/02/2026.');
    assert.equal(notes[3].group, 'PASS');
  });

  it('leaves out suppressed findings and badges that are not active (switched off)', () => {
    const keys = scoringNotesOf(findings, active).map((note) => note.key);
    assert.equal(keys.includes('CNTT_LATE'), false);
    assert.equal(keys.includes('PHASE_DONE:DEV'), false);
  });

  it('copes with an Epic without a scorecard', () => {
    assert.deepEqual(scoringNotesOf(null, null), []);
    assert.deepEqual(scoringNotesOf([], ['CNTT_PASS']), []);
  });
});

describe('viDates', () => {
  it('turns ISO dates into dd/MM/yyyy and leaves other numbers alone', () => {
    assert.equal(viDates('Target 2026-02-20, R4G 2026-03-01; 30 ngày'), 'Target 20/02/2026, R4G 01/03/2026; 30 ngày');
    assert.equal(viDates('BPMCN-2026'), 'BPMCN-2026');
  });
});
