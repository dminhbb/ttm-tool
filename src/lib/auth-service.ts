import 'server-only';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import type { AuthUser, DomainSummary, ManagedUser, ProjectSummary, UserInput, UserProfileDetails, UserRole } from '@/lib/auth-types';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
import { verifyCaptcha } from '@/lib/captcha-service';
import { validatePassword } from '@/lib/password-rules';
import { getUsageStatsTotals, recordUsageEvent, USAGE_STATS_RETENTION_DAYS } from '@/lib/usage-stats-service';
import { extractUsername, normalizeUsername } from '@/lib/username';
import { recordAppLogin } from '@/lib/visit-counter-service';

export { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
const SESSION_HOURS = { remembered: 24, standard: 2 } as const;
const PASSWORD_HASH_ROUNDS = 12;
const BULK_USER_DEFAULT_PASSWORD = 'ZAQ!2wsx';
// From the 3rd recorded failure onward, the NEXT attempt must include a valid CAPTCHA before the
// password is even checked (slows down scripted brute-force without revealing the exact count to
// the caller). At 5 recorded failures the account is auto-deactivated and a password-reset ticket
// is auto-filed, same shape as a user-initiated "Quên mật khẩu" request.
const CAPTCHA_REQUIRED_AFTER_FAILURES = 3;
const LOCK_AFTER_FAILURES = 5;

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Runs a users query that also reads users.badge_design_style (`__BADGE_COLUMN__` marks where `column` goes). A database the
 * migration 20261104 has not reached yet answers 42703 (undefined column): the query is repeated without it, so deploying
 * the code before the migration can never lock everybody out (2026-10-27).
 */
async function queryWithBadgeColumn<T extends object>(sql: string, params: unknown[], column: string) {
  try {
    return await pool.query<T>(sql.replace('__BADGE_COLUMN__', column), params);
  } catch (error: unknown) {
    if ((error as { code?: string }).code !== '42703') throw error;
    return pool.query<T>(sql.replace('__BADGE_COLUMN__', ''), params);
  }
}

function mapAuthUser(row: AuthUser & { mustChangePassword?: boolean }): AuthUser {
  return { badgeDesignStyle: row.badgeDesignStyle === 'minimal' ? 'minimal' : 'list', email: row.email, fullName: row.fullName, id: row.id, role: row.role, mustChangePassword: Boolean(row.mustChangePassword) };
}

export { extractUsername, normalizeUsername } from '@/lib/username';

export type AuthResult =
  | { user: AuthUser }
  | { error: 'INACTIVE' }
  | { error: 'LOCKED' }
  | { error: 'CAPTCHA_REQUIRED' }
  | { error: 'INVALID_CREDENTIALS'; requiresCaptcha: boolean; showWarning: boolean };

/**
 * Increments the account's failed-login counter and, once it reaches LOCK_AFTER_FAILURES,
 * deactivates the account and auto-files a password-reset ticket (same table/shape as the
 * user-initiated "Quên mật khẩu" flow in /api/password-reset-requests) so an admin sees it show up
 * in the same queue. Guards against filing a second ticket if the account is somehow re-activated
 * and locked out again before the first ticket is resolved.
 */
async function recordFailedLogin(userId: number, email: string): Promise<number> {
  const result = await pool.query<{ failedLoginAttempts: number }>(`
    UPDATE users SET failed_login_attempts = failed_login_attempts + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING failed_login_attempts AS "failedLoginAttempts";
  `, [userId]);
  const failedLoginAttempts = result.rows[0].failedLoginAttempts;
  if (failedLoginAttempts >= LOCK_AFTER_FAILURES) {
    // One statement (CTE + INSERT), not two separate queries — deactivating the account and
    // filing its ticket must be all-or-nothing. This used to be 2 queries, and the 2nd (the
    // INSERT) threw `42P08 inconsistent types deduced for parameter $1` (a bare `SELECT $1` can't
    // share a type with `email = $1` in the same statement without an explicit cast) *after* the
    // 1st had already committed — silently leaving accounts locked with no ticket ever filed.
    await pool.query(`
      WITH deactivated AS (
        UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1
      )
      INSERT INTO password_reset_requests (email)
      SELECT $2::varchar WHERE NOT EXISTS (
        SELECT 1 FROM password_reset_requests
        WHERE SPLIT_PART(LOWER(email), '@', 1) = SPLIT_PART(LOWER($2), '@', 1) AND status = 'PENDING'
      );
    `, [userId, normalizeUsername(email)]);
  }
  return failedLoginAttempts;
}

export async function authenticateLocal(username: string, password: string, captchaId?: string, captcha?: string): Promise<AuthResult> {
  // A username, or an @mbbank.com.vn email: an address of any other domain is not an account here, even
  // when its local part happens to match one.
  const typed = username.trim().toLowerCase();
  if (typed.includes('@') && !typed.endsWith('@mbbank.com.vn')) return { error: 'INVALID_CREDENTIALS', requiresCaptcha: false, showWarning: false };
  const normalizedUsername = extractUsername(username);
  const result = await queryWithBadgeColumn<AuthUser & { isActive: boolean; mustChangePassword: boolean; passwordHash: string; failedLoginAttempts: number }>(`
    SELECT id, email, full_name AS "fullName", role, is_active AS "isActive", password_hash AS "passwordHash", must_change_password AS "mustChangePassword", failed_login_attempts AS "failedLoginAttempts"__BADGE_COLUMN__
    FROM users
    WHERE SPLIT_PART(LOWER(email), '@', 1) = $1;
  `, [normalizedUsername], ', badge_design_style AS "badgeDesignStyle"');
  const user = result.rows[0];
  if (!user) return { error: 'INVALID_CREDENTIALS', requiresCaptcha: false, showWarning: false };
  if (!user.isActive) return { error: 'INACTIVE' };

  if (user.failedLoginAttempts >= CAPTCHA_REQUIRED_AFTER_FAILURES) {
    if (!captchaId || !captcha || !verifyCaptcha(captchaId, captcha)) return { error: 'CAPTCHA_REQUIRED' };
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failedLoginAttempts = await recordFailedLogin(user.id, user.email);
    if (failedLoginAttempts >= LOCK_AFTER_FAILURES) return { error: 'LOCKED' };
    return {
      error: 'INVALID_CREDENTIALS',
      requiresCaptcha: failedLoginAttempts >= CAPTCHA_REQUIRED_AFTER_FAILURES,
      showWarning: failedLoginAttempts >= CAPTCHA_REQUIRED_AFTER_FAILURES,
    };
  }

  if (user.failedLoginAttempts > 0) await pool.query('UPDATE users SET failed_login_attempts = 0 WHERE id = $1;', [user.id]);
  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [user.id]);
  await recordUsageEvent(user.id, 'login');
  await recordAppLogin(user.id);
  return { user: mapAuthUser(user) };
}

export async function verifyUserPassword(userId: number, password: string): Promise<boolean> {
  const result = await pool.query<{ passwordHash: string }>('SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 AND is_active = TRUE;', [userId]);
  const user = result.rows[0];
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function changeUserPassword(userId: number, currentPassword: string, newPassword: string): Promise<{ error?: string; success: boolean }> {
  const isValidCurrent = await verifyUserPassword(userId, currentPassword);
  if (!isValidCurrent) return { success: false, error: 'Mật khẩu hiện tại không chính xác.' };

  const validation = validatePassword(newPassword);
  if (!validation.isValid) return { success: false, error: validation.error };

  const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
  await pool.query('UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [userId, passwordHash]);
  return { success: true };
}

export async function createSession(userId: number, remember: boolean): Promise<{ expiresAt: Date; token: string }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS[remember ? 'remembered' : 'standard'] * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3);',
    [tokenHash(token), userId, expiresAt],
  );
  return { expiresAt, token };
}

export async function getCurrentUser(request?: NextRequest): Promise<AuthUser | null> {
  const token = request?.cookies.get(SESSION_COOKIE_NAME)?.value ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const result = await queryWithBadgeColumn<AuthUser>(`
    SELECT u.id, u.email, u.full_name AS "fullName", u.role, u.must_change_password AS "mustChangePassword"__BADGE_COLUMN__
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE;
  `, [tokenHash(token)], ', u.badge_design_style AS "badgeDesignStyle"');
  return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
}

export async function updateUserBadgeDesignStyle(userId: number, style: 'list' | 'minimal'): Promise<void> {
  try {
    await pool.query(
      'UPDATE users SET badge_design_style = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;',
      [userId, style],
    );
  } catch (error: unknown) {
    // Migration 20261104 not applied yet: the choice stays in this browser only (localStorage).
    if ((error as { code?: string }).code !== '42703') throw error;
  }
}

export async function deleteCurrentSession(request?: NextRequest): Promise<void> {
  const token = request?.cookies.get(SESSION_COOKIE_NAME)?.value ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1;', [tokenHash(token)]);
}

export async function requireUser(request: NextRequest, roles?: UserRole[]): Promise<AuthUser> {
  const user = await getCurrentUser(request);
  if (!user) throw new AuthError('UNAUTHENTICATED');
  if (roles && !roles.includes(user.role)) throw new AuthError('FORBIDDEN');
  return user;
}

export class AuthError extends Error {
  constructor(public readonly code: 'FORBIDDEN' | 'UNAUTHENTICATED') {
    super(code);
  }
}

export class ApprovalError extends Error {
  constructor(public readonly stage: 'ASSIGN_DOMAIN' | 'COMPLETE') {
    super('APPROVAL_FAILED');
    this.name = 'ApprovalError';
  }
}

export async function getUserProfileDetails(userId: number, role: UserRole): Promise<UserProfileDetails> {
  const domains = await pool.query<DomainSummary>(`
    SELECT d.id, d.domain_code AS "domainCode", d.domain_name AS "domainName"
    FROM domains d
    JOIN user_domains ud ON ud.domain_id = d.id
    WHERE ud.user_id = $1
    ORDER BY d.domain_name;
  `, [userId]);

  const ledProjects = await pool.query<ProjectSummary>(`
    SELECT p.id, p.source_project_key AS "projectKey", p.project_name AS "projectName"
    FROM projects p
    JOIN user_projects up ON up.project_id = p.id
    WHERE up.user_id = $1
    ORDER BY p.project_name;
  `, [userId]);

  let viewableProjects: ProjectSummary[] | null = null;
  if (role === 'ADMIN') {
    // Same visibility ADMIN gets on every Epic screen (resolveAccessScope) — every active project
    // in a domain they're assigned to, plus the projects they are PM/SM of.
    const result = await pool.query<ProjectSummary>(`
      SELECT DISTINCT p.id, p.source_project_key AS "projectKey", p.project_name AS "projectName"
      FROM projects p
      WHERE p.is_active AND (
        p.domain_id IN (SELECT ud.domain_id FROM user_domains ud WHERE ud.user_id = $1)
        OR p.id IN (SELECT up.project_id FROM user_projects up WHERE up.user_id = $1)
      )
      ORDER BY p.project_name;
    `, [userId]);
    viewableProjects = result.rows;
  }

  const usageStats = await getUsageStatsTotals(userId);

  return { domains: domains.rows, ledProjects: ledProjects.rows, viewableProjects, usageStats };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const result = await pool.query<ManagedUser>(`
    SELECT
      u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive",
      COALESCE(array_agg(DISTINCT ud.domain_id) FILTER (WHERE ud.domain_id IS NOT NULL), '{}') AS "domainIds",
      COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') AS "projectIds",
      COALESCE(upc_agg.project_components, '{}'::jsonb) AS "projectComponents",
      jsonb_build_object(
        'loginCount', COALESCE(us.login_count, 0),
        'featureCount', COALESCE(us.feature_count, 0),
        'dataCount', COALESCE(us.data_count, 0)
      ) AS "usageStats"
    FROM users u
    LEFT JOIN user_domains ud ON ud.user_id = u.id
    LEFT JOIN user_projects up ON up.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(login_count)::int AS login_count, SUM(feature_count)::int AS feature_count, SUM(data_count)::int AS data_count
      FROM user_usage_daily_stats
      WHERE stat_date >= CURRENT_DATE - $1::int
      GROUP BY user_id
    ) us ON us.user_id = u.id
    LEFT JOIN (
      SELECT user_id, jsonb_object_agg(project_id::text, components) AS project_components
      FROM (
        SELECT user_id, project_id, array_agg(component_name ORDER BY component_name) AS components
        FROM user_project_components
        GROUP BY user_id, project_id
      ) grouped
      GROUP BY user_id
    ) upc_agg ON upc_agg.user_id = u.id
    GROUP BY u.id, us.login_count, us.feature_count, us.data_count, upc_agg.project_components
    ORDER BY SPLIT_PART(LOWER(u.email), '@', 1) ASC;
  `, [USAGE_STATS_RETENTION_DAYS - 1]);
  return result.rows;
}

/**
 * Replaces only THIS user's own domain/project/component grants — never touches another user's
 * user_projects rows. A project can have many PM/SM users at once (each gets their own row here);
 * projects.lead_name no longer exists (dropped — see 20260908_drop_projects_lead_name.sql), display
 * names for a project's PM/SM list are derived live via a user_projects join (master-data-service.ts).
 */
async function replacePermissions(client: PoolClient, userId: number, input: UserInput): Promise<void> {
  const user = await client.query<{ id: number }>('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (user.rowCount !== 1) throw new Error('USER_NOT_FOUND');
  await client.query('DELETE FROM user_domains WHERE user_id = $1;', [userId]);
  // ON DELETE CASCADE on user_project_components (FK to user_projects) clears its rows too.
  await client.query('DELETE FROM user_projects WHERE user_id = $1;', [userId]);
  for (const domainId of input.domainIds) await client.query('INSERT INTO user_domains (user_id, domain_id) VALUES ($1, $2);', [userId, domainId]);
  for (const projectId of input.projectIds) {
    await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2);', [userId, projectId]);
    // Component narrowing is optional per project — an absent/empty entry means full project access.
    const components = input.projectComponents[String(projectId)] ?? [];
    for (const componentName of components) {
      await client.query('INSERT INTO user_project_components (user_id, project_id, component_name) VALUES ($1, $2, $3);', [userId, projectId, componentName]);
    }
  }
}

/**
 * What the derived caches hold about these users as PM/SM, as one comparable string — '' when none
 * of them is PM/SM of an active project. Every cached Epic row carries its project's PM/SM usernames
 * (getProjectMetaByProjectKeyMap in master-data-service.ts: usernames of the user_projects users of
 * an active project, narrowed by the user's component grants), so a user save needs a cache rebuild
 * exactly when this differs before and after.
 */
export async function getPmSmCacheFootprint(userIds: number[]): Promise<string> {
  // Role and component narrowing are part of the footprint: since 2026-10-12 each cached Epic row names
  // only the PM/SMs responsible for its components (epic-pm-sm-assignment-service.ts), and narrowing
  // only applies to role USER.
  const result = await pool.query<{ components: string[]; id: number; projectIds: number[]; role: string; username: string }>(`
    SELECT u.id, SPLIT_PART(LOWER(u.email), '@', 1) AS username, u.role,
      array_agg(DISTINCT up.project_id) AS "projectIds",
      COALESCE(array_agg(DISTINCT upc.project_id::text || ':' || upc.component_name)
        FILTER (WHERE upc.component_name IS NOT NULL), ARRAY[]::text[]) AS "components"
    FROM users u
    JOIN user_projects up ON up.user_id = u.id
    JOIN projects p ON p.id = up.project_id AND p.is_active
    LEFT JOIN user_project_components upc ON upc.user_id = up.user_id AND upc.project_id = up.project_id
    WHERE u.id = ANY($1::int[])
    GROUP BY u.id, SPLIT_PART(LOWER(u.email), '@', 1), u.role
    ORDER BY u.id;
  `, [userIds]);
  return result.rows.length === 0 ? '' : JSON.stringify(result.rows.map((row) => [row.id, row.username, row.role, row.projectIds, [...row.components].sort()]));
}

/**
 * Every user's username (local part before `@mbbank.com.vn`, lowercase) must be globally unique
 * across all user records (active or inactive). The database enforces it — unique index
 * idx_users_unique_username (migration 20261019d) — and the writes below turn its violation into this
 * error, so the user sees which username is taken. No separate SELECT check: it would only repeat
 * the index, and could still race with a concurrent insert.
 */
export class DuplicateUsernameError extends Error {
  constructor(public readonly username: string) {
    super(`Username "${username}" đã tồn tại trong hệ thống.`);
  }
}

/** The DuplicateUsernameError behind a violation of idx_users_unique_username, or null for any other
 * error. The username comes from the violation's detail ("Key (…)=(abc) already exists."), falling
 * back to `fallbackUsername` when Postgres doesn't report it. */
function duplicateUsernameErrorOf(error: unknown, fallbackUsername = ''): DuplicateUsernameError | null {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== '23505') return null;
  if (!('constraint' in error) || error.constraint !== 'idx_users_unique_username') return null;
  const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : '';
  return new DuplicateUsernameError(/=\((.+)\) already exists/.exec(detail)?.[1] ?? fallbackUsername);
}

export async function createManagedUser(input: UserInput): Promise<ManagedUser> {
  const email = normalizeUsername(input.email);
  const passwordHash = await bcrypt.hash(input.password!, PASSWORD_HASH_ROUNDS);
  const client = await getClient();
  let userId = 0;
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(`
      INSERT INTO users (email, full_name, password_hash, role, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id;
    `, [email, input.fullName, passwordHash, input.role, input.isActive]);
    userId = result.rows[0].id;
    await replacePermissions(client, userId, input);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw duplicateUsernameErrorOf(error, extractUsername(email)) ?? error;
  } finally { client.release(); }
  return (await listManagedUsers()).find((user) => user.id === userId)!;
}

/** Current role of each given user id (unknown ids are simply absent) — for the role-hierarchy
 * guard on user-management routes (canManageUserWithRole in auth-types.ts). */
export async function getUserRolesByIds(ids: number[]): Promise<Map<number, UserRole>> {
  if (ids.length === 0) return new Map();
  const result = await pool.query<{ id: number; role: UserRole }>('SELECT id, role FROM users WHERE id = ANY($1::int[]);', [ids]);
  return new Map(result.rows.map((row) => [row.id, row.role]));
}

export async function getUserIdsByUsernames(usernames: string[]): Promise<number[]> {
  const normalized = [...new Set(usernames.map(extractUsername).filter(Boolean))];
  if (normalized.length === 0) return [];
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE SPLIT_PART(LOWER(email), '@', 1) = ANY($1::text[]);",
    [normalized],
  );
  return result.rows.map((row) => row.id);
}

export async function updateManagedUser(id: number, input: UserInput): Promise<ManagedUser | null> {
  const email = normalizeUsername(input.email);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(`
      UPDATE users SET email = $2, full_name = $3, role = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id;
    `, [id, email, input.fullName, input.role, input.isActive]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    await replacePermissions(client, id, input);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw duplicateUsernameErrorOf(error, extractUsername(email)) ?? error;
  } finally { client.release(); }
  return (await listManagedUsers()).find((user) => user.id === id) ?? null;
}

export async function resetUserPassword(id: number, password: string, actorUserId: number): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  const result = await pool.query('UPDATE users SET password_hash = $2, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [id, passwordHash]);
  if (result.rowCount !== 1) return false;
  await pool.query('DELETE FROM auth_sessions WHERE user_id = $1;', [id]);
  await pool.query('INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4);', [actorUserId, 'RESET_PASSWORD', 'USER', String(id)]);
  return true;
}

export async function deleteManagedUser(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM users WHERE id = $1;', [id]);
  return result.rowCount === 1;
}

export async function deleteInactiveManagedUsers(ids: number[]): Promise<number> {
  const result = await pool.query('DELETE FROM users WHERE id = ANY($1::int[]) AND is_active = FALSE;', [ids]);
  return result.rowCount ?? 0;
}

export async function createInactiveUsersFromUsernames(usernames: string[]): Promise<{ created: string[]; skipped: string[] }> {
  const normalizedUsernames = [...new Set(usernames.map(extractUsername).filter(Boolean))];
  const emails = normalizedUsernames.map(normalizeUsername);
  const hashes = await Promise.all(normalizedUsernames.map(() => bcrypt.hash(BULK_USER_DEFAULT_PASSWORD, PASSWORD_HASH_ROUNDS)));
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ username: string }>(
      "SELECT SPLIT_PART(LOWER(email), '@', 1) AS username FROM users WHERE SPLIT_PART(LOWER(email), '@', 1) = ANY($1::text[])",
      [normalizedUsernames],
    );
    const existingUsernames = new Set(existing.rows.map((row) => row.username));
    const created: string[] = [];
    const skipped: string[] = [];
    for (let index = 0; index < normalizedUsernames.length; index += 1) {
      const uname = normalizedUsernames[index];
      if (existingUsernames.has(uname)) { skipped.push(uname); continue; }
      await client.query('INSERT INTO users (email, full_name, password_hash, role, is_active) VALUES ($1, $2, $3, $4, FALSE)', [emails[index], uname, hashes[index], 'USER']);
      existingUsernames.add(uname);
      created.push(uname);
    }
    await client.query('COMMIT');
    return { created, skipped };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function approveInactiveUsers(ids: number[], domainId?: number): Promise<{ approved: number; domainAssigned: number }> {
  const client = await getClient();
  let stage: ApprovalError['stage'] = 'ASSIGN_DOMAIN';
  try {
    await client.query('BEGIN');
    const users = await client.query<{ email: string; id: number }>('SELECT id, email FROM users WHERE id = ANY($1::int[]) AND is_active = FALSE FOR UPDATE', [ids]);
    if (users.rowCount !== ids.length) throw new Error('INVALID_USERS');
    // Usernames need no check here: these users are already in the table, so idx_users_unique_username
    // has kept them unique; the email clean-up below is the only write that could collide (mapped in catch).
    const missingDomains = await client.query<{ id: number }>('SELECT u.id FROM users u WHERE u.id = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM user_domains ud WHERE ud.user_id = u.id)', [ids]);
    const missingDomainIds = missingDomains.rows.map((user) => user.id);
    if (missingDomainIds.length > 0) {
      if (!domainId) throw new Error('DOMAIN_REQUIRED');
      const domain = await client.query('SELECT id FROM domains WHERE id = $1 AND is_active = TRUE', [domainId]);
      if (domain.rowCount !== 1) throw new Error('INVALID_DOMAIN');
      await client.query('INSERT INTO user_domains (user_id, domain_id) SELECT selected.id, $2 FROM unnest($1::int[]) AS selected(id) ON CONFLICT DO NOTHING', [missingDomainIds, domainId]);
    }
    stage = 'COMPLETE';
    await client.query('UPDATE users SET email = LOWER(BTRIM(email)), is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[]) AND is_active = FALSE', [ids]);
    await client.query('COMMIT');
    return { approved: users.rows.length, domainAssigned: missingDomainIds.length };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const duplicate = duplicateUsernameErrorOf(error);
    if (duplicate) throw duplicate;
    const isKnownBusinessError = error instanceof DuplicateUsernameError || (error instanceof Error && ['DOMAIN_REQUIRED', 'INVALID_DOMAIN', 'INVALID_USERS'].includes(error.message));
    const isDatabaseConflict = typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
    if (isKnownBusinessError || isDatabaseConflict || error instanceof ApprovalError) throw error;
    const databaseCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
    console.error('User approval transaction failed', { databaseCode, stage });
    throw new ApprovalError(stage);
  } finally { client.release(); }
}
