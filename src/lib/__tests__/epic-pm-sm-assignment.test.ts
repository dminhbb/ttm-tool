import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPmSmAssignments, assignedPmSmNames, matchesPmSmFilter, UNASSIGNED_PM_SM, type PmSmNarrowings } from '../epic-pm-sm-assignment';
import { summarizeTtmFunnel, type TtmFunnelRow } from '../ttm-funnel-summary';

describe('PM/SM by component (owner rule 2026-10-12)', () => {
  // Project API has two PM/SMs: nguyenha for the whole project, dophuclamn narrowed to API-Line-1.
  const narrowings: PmSmNarrowings = new Map([['API', new Map([['dophuclamn', ['API-Line-1']]])]]);
  const legacyOwners = 'dophuclamn, nguyenha';

  it('an Epic without a component belongs to the whole-project PM/SM only', () => {
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', [], narrowings), ['nguyenha']);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', null, narrowings), ['nguyenha']);
  });

  it('an Epic of the narrowed component belongs to both; one of another component does not reach the narrowed PM/SM', () => {
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-1'], narrowings), ['dophuclamn', 'nguyenha']);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-2', 'API-Line-1'], narrowings), ['dophuclamn', 'nguyenha']);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-2'], narrowings), ['nguyenha']);
  });

  it('names and components match whatever their case / spacing (2026-10-19)', () => {
    const typed: PmSmNarrowings = new Map([['API', new Map([['DoPhucLamN ', [' api-line-1']]])]]);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-1'], typed), ['dophuclamn', 'nguyenha']);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-2'], typed), ['nguyenha']);
  });

  it('a project nobody is narrowed in keeps every PM/SM; when everybody is narrowed an Epic can be left with no one', () => {
    assert.deepEqual(assignedPmSmNames('An, Bình', 'WM', [], narrowings), ['An', 'Bình']);
    const allNarrowed: PmSmNarrowings = new Map([['API', new Map([['dophuclamn', ['API-Line-1']], ['nguyenha', ['API-Line-2', 'API-Line-3']]])]]);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', [], allNarrowed), []);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-9'], allNarrowed), []);
    assert.deepEqual(assignedPmSmNames(legacyOwners, 'API', ['API-Line-3'], allNarrowed), ['nguyenha']);
  });

  it('applyPmSmAssignments rewrites ownerName on the rows of narrowed projects and leaves the others untouched', () => {
    const rows = [
      { components: [] as string[], epicKey: 'API-1', ownerName: legacyOwners, projectKey: 'API' },
      { components: ['API-Line-1'], epicKey: 'API-2', ownerName: legacyOwners, projectKey: 'API' },
      { components: [] as string[], epicKey: 'WM-1', ownerName: 'An, Bình', projectKey: 'WM' },
    ];
    const stamped = applyPmSmAssignments(rows, narrowings);
    assert.deepEqual(stamped.map((row) => row.ownerName), ['nguyenha', legacyOwners, 'An, Bình']);
    assert.equal(stamped[1], rows[1]);
    assert.equal(stamped[2], rows[2]);
    assert.deepEqual(applyPmSmAssignments(rows, new Map()), rows);
  });

  it('"Lọc PM/SM": a name matches the Epics that person has a share of; UNASSIGNED_PM_SM the ones left with nobody', () => {
    assert.equal(matchesPmSmFilter('nguyenha', []), true);
    assert.equal(matchesPmSmFilter('dophuclamn, nguyenha', ['dophuclamn']), true);
    assert.equal(matchesPmSmFilter('nguyenha', ['dophuclamn']), false);
    assert.equal(matchesPmSmFilter('', ['dophuclamn']), false);
    assert.equal(matchesPmSmFilter('', ['dophuclamn', UNASSIGNED_PM_SM]), true);
    assert.equal(matchesPmSmFilter('nguyenha', [UNASSIGNED_PM_SM]), false);
  });

  it('the "Theo PM/SM" numbers of the owner\'s example: Epic X (no component) → nguyenha 1; Epic Y (API-Line-1) → 0,5 each', () => {
    const funnelRow = (epic: { components: string[]; ownerName: string }): TtmFunnelRow => ({
      alertLevel: 'NONE', currentStatus: 'In Progress', domainName: 'D1', epicType: 'CT-Lv12', hasDataAnomaly: false,
      projectKey: 'API', projectName: 'API', qaInScope: true, r4gDate: null, releaseAxisState: 'NONE', releaseGraceDeadline: null,
      requestingUnit: 'Khối A', scoringBadges: undefined, scoringIndexFlags: undefined, ttmCnttInScope: true, ttmE2eAlertLevel: 'NONE', ttmExclusion: null, ...epic,
    });
    const rows = applyPmSmAssignments([
      funnelRow({ components: [], ownerName: legacyOwners }), // Epic X
      funnelRow({ components: ['API-Line-1'], ownerName: legacyOwners }), // Epic Y
    ], narrowings);
    const pmsm = summarizeTtmFunnel(rows).insights.breakdowns.pmsm;
    assert.deepEqual(pmsm.map((item) => [item.name, item.total]), [['nguyenha', 1.5], ['dophuclamn', 0.5]]);
  });
});
