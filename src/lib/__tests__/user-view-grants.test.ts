import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchesViewGrants, parseUserViewGrantsInput, roleUsesViewGrants, type ViewGrants } from '@/lib/user-view-grants';

const grants = (overrides: Partial<ViewGrants> = {}): ViewGrants => ({
  createdAfter: null,
  epicKeys: [],
  projects: new Map(),
  startAfter: null,
  ...overrides,
});

const epic = { components: ['Core'], createdDate: '2026-05-10', epicKey: 'ABC-1', projectKey: 'ABC', startDate: '2026-06-01' };

describe('Quyền xem — who it applies to (owner 2026-11-01)', () => {
  it('USER and ADMIN only', () => {
    assert.equal(roleUsesViewGrants('USER'), true);
    assert.equal(roleUsesViewGrants('ADMIN'), true);
    assert.equal(roleUsesViewGrants('SUPERADMIN'), false);
    assert.equal(roleUsesViewGrants('SUPERVISOR'), false);
  });
});

describe('Quyền xem — matching an Epic', () => {
  it('a project without components grants every Epic of it', () => {
    assert.equal(matchesViewGrants(grants({ projects: new Map([['ABC', []]]) }), epic), true);
    assert.equal(matchesViewGrants(grants({ projects: new Map([['XYZ', []]]) }), epic), false);
  });

  it('components narrow the project; an Epic without components is not narrowed', () => {
    const narrowed = grants({ projects: new Map([['ABC', ['Payments']]]) });
    assert.equal(matchesViewGrants(narrowed, epic), false);
    assert.equal(matchesViewGrants(narrowed, { ...epic, components: ['Payments', 'Core'] }), true);
    assert.equal(matchesViewGrants(narrowed, { ...epic, components: [] }), true);
  });

  it('date limits are strict "after" and an Epic without Start Date fails the Start Date limit', () => {
    const project = new Map([['ABC', []]]);
    assert.equal(matchesViewGrants(grants({ createdAfter: '2026-05-09', projects: project }), epic), true);
    assert.equal(matchesViewGrants(grants({ createdAfter: '2026-05-10', projects: project }), epic), false);
    assert.equal(matchesViewGrants(grants({ projects: project, startAfter: '2026-05-31' }), epic), true);
    assert.equal(matchesViewGrants(grants({ projects: project, startAfter: '2026-05-31' }), { ...epic, startDate: null }), false);
  });

  it('an Epic granted by key is always shown — the date limits do not apply to it', () => {
    const byKey = grants({ createdAfter: '2027-01-01', epicKeys: ['ABC-1'], startAfter: '2027-01-01' });
    assert.equal(matchesViewGrants(byKey, { ...epic, epicKey: 'abc-1' }), true);
  });

  it('no grants = nothing extra', () => {
    assert.equal(matchesViewGrants(null, epic), false);
    assert.equal(matchesViewGrants(grants(), epic), false);
  });
});

describe('Quyền xem — parsing the tab input', () => {
  it('normalizes keys, de-duplicates and accepts empty dates', () => {
    const parsed = parseUserViewGrantsInput({
      createdAfter: '', epicKeys: ['abc-1', 'ABC-1 ', 'XY_Z-22'], projects: [{ components: ['B', 'A', 'A'], projectId: 3 }], startAfter: '2026-09-01',
    });
    assert.ok('value' in parsed);
    assert.deepEqual(parsed.value, { createdAfter: null, epicKeys: ['ABC-1', 'XY_Z-22'], projects: [{ components: ['A', 'B'], projectId: 3 }], startAfter: '2026-09-01' });
  });

  it('rejects bad keys, projects and dates', () => {
    assert.ok('error' in parseUserViewGrantsInput({ epicKeys: ['not a key'] }));
    assert.ok('error' in parseUserViewGrantsInput({ projects: [{ projectId: 0 }] }));
    assert.ok('error' in parseUserViewGrantsInput({ createdAfter: '01/09/2026' }));
    assert.ok('error' in parseUserViewGrantsInput(null));
  });
});

describe('Quyền xem — component names typed by an admin vs held by Jira (2026-11-03)', () => {
  it('compare ignoring case, outer and repeated spaces', () => {
    const narrowed = grants({ projects: new Map([['ABC', [' core  api ']]]) });
    assert.equal(matchesViewGrants(narrowed, { ...epic, components: ['Core API'] }), true);
    assert.equal(matchesViewGrants(narrowed, { ...epic, components: ['CORE api'] }), true);
    assert.equal(matchesViewGrants(narrowed, { ...epic, components: ['Billing'] }), false);
  });
});
