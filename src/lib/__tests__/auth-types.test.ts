import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canGrantRole, canManageUserWithRole, USER_ROLES } from '../auth-types';
import type { UserRole } from '../auth-types';

describe('canGrantRole', () => {
  it('SUPERADMIN can grant any role, including SUPERADMIN', () => {
    for (const role of USER_ROLES) assert.equal(canGrantRole('SUPERADMIN', role), true);
  });

  it('ADMIN can only grant roles below ADMIN (SUPERVISOR, USER) — not SUPERADMIN or ADMIN', () => {
    assert.equal(canGrantRole('ADMIN', 'SUPERADMIN'), false);
    assert.equal(canGrantRole('ADMIN', 'ADMIN'), false);
    assert.equal(canGrantRole('ADMIN', 'SUPERVISOR'), true);
    assert.equal(canGrantRole('ADMIN', 'USER'), true);
  });

  it('SUPERVISOR can only grant USER — not SUPERADMIN, ADMIN or SUPERVISOR', () => {
    assert.equal(canGrantRole('SUPERVISOR', 'SUPERADMIN'), false);
    assert.equal(canGrantRole('SUPERVISOR', 'ADMIN'), false);
    assert.equal(canGrantRole('SUPERVISOR', 'SUPERVISOR'), false);
    assert.equal(canGrantRole('SUPERVISOR', 'USER'), true);
  });

  it('USER cannot grant any role, not even USER', () => {
    for (const role of USER_ROLES) assert.equal(canGrantRole('USER', role), false);
  });

  it('hierarchy order matches USER_ROLES declaration (most to least privileged)', () => {
    const expected: UserRole[] = ['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'USER'];
    assert.deepEqual([...USER_ROLES], expected);
  });
});

describe('canManageUserWithRole', () => {
  it('ADMIN cannot touch an existing SUPERADMIN or ADMIN, only SUPERVISOR/USER; SUPERADMIN can touch anyone', () => {
    assert.equal(canManageUserWithRole('ADMIN', 'SUPERADMIN'), false);
    assert.equal(canManageUserWithRole('ADMIN', 'ADMIN'), false);
    assert.equal(canManageUserWithRole('ADMIN', 'SUPERVISOR'), true);
    assert.equal(canManageUserWithRole('ADMIN', 'USER'), true);
    for (const role of USER_ROLES) assert.equal(canManageUserWithRole('SUPERADMIN', role), true);
  });
});
