import 'server-only';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import pool, { getClient } from '@/lib/db';
import type { AuthUser, DomainSummary, ManagedUser, ProjectSummary, UserInput, UserProfileDetails, UserRole } from '@/lib/auth-types';
import { SESSION_COOKIE_NAME } from '@/lib/auth-constants';

export { SESSION_COOKIE_NAME } from '@/lib/auth-constants';
const SESSION_HOURS = { remembered: 24, standard: 2 } as const;
const PASSWORD_HASH_ROUNDS = 12;
const BULK_USER_DEFAULT_PASSWORD = 'ZAQ!2wsx';

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function mapAuthUser(row: AuthUser): AuthUser {
  return { email: row.email, fullName: row.fullName, id: row.id, role: row.role };
}

export function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.includes('@') ? normalized : `${normalized}@mbbank.com.vn`;
}

export async function authenticateLocal(username: string, password: string): Promise<AuthUser | null> {
  const email = normalizeUsername(username);
  const result = await pool.query<AuthUser & { passwordHash: string }>(`
    SELECT id, email, full_name AS "fullName", role, password_hash AS "passwordHash"
    FROM users
    WHERE email = $1 AND is_active = TRUE;
  `, [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [user.id]);
  return mapAuthUser(user);
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
  const result = await pool.query<AuthUser>(`
    SELECT u.id, u.email, u.full_name AS "fullName", u.role
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE;
  `, [tokenHash(token)]);
  return result.rows[0] ?? null;
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
    SELECT p.id, p.project_key AS "projectKey", p.project_name AS "projectName"
    FROM projects p
    JOIN user_projects up ON up.project_id = p.id
    WHERE up.user_id = $1
    ORDER BY p.project_name;
  `, [userId]);

  let viewableProjects: ProjectSummary[] | null = null;
  if (role === 'ADMIN') {
    // Same domain-scoped visibility ADMIN gets in epic-alerts (resolveAccessScope) — every
    // active project in a domain they're assigned to.
    const result = await pool.query<ProjectSummary>(`
      SELECT DISTINCT p.id, p.project_key AS "projectKey", p.project_name AS "projectName"
      FROM projects p
      JOIN user_domains ud ON ud.domain_id = p.domain_id
      WHERE ud.user_id = $1 AND p.is_active
      ORDER BY p.project_name;
    `, [userId]);
    viewableProjects = result.rows;
  }

  return { domains: domains.rows, ledProjects: ledProjects.rows, viewableProjects };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const result = await pool.query<ManagedUser>(`
    SELECT
      u.id, u.email, u.full_name AS "fullName", u.role, u.is_active AS "isActive",
      COALESCE(array_agg(DISTINCT ud.domain_id) FILTER (WHERE ud.domain_id IS NOT NULL), '{}') AS "domainIds",
      COALESCE(array_agg(DISTINCT up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') AS "projectIds"
    FROM users u
    LEFT JOIN user_domains ud ON ud.user_id = u.id
    LEFT JOIN user_projects up ON up.user_id = u.id
    GROUP BY u.id
    ORDER BY u.email ASC;
  `);
  return result.rows;
}

async function replacePermissions(client: PoolClient, userId: number, input: UserInput): Promise<void> {
  const user = await client.query<{ fullName: string }>('SELECT full_name AS "fullName" FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (user.rowCount !== 1) throw new Error('USER_NOT_FOUND');
  const existingProjectRows = await client.query<{ projectId: number }>('SELECT project_id AS "projectId" FROM user_projects WHERE user_id = $1', [userId]);
  const existingProjectIds = existingProjectRows.rows.map((project) => project.projectId);
  const removedProjectIds = existingProjectIds.filter((projectId) => !input.projectIds.includes(projectId));
  await client.query('DELETE FROM user_domains WHERE user_id = $1;', [userId]);
  await client.query('DELETE FROM user_projects WHERE user_id = $1;', [userId]);
  for (const domainId of input.domainIds) await client.query('INSERT INTO user_domains (user_id, domain_id) VALUES ($1, $2);', [userId, domainId]);
  if (removedProjectIds.length > 0) await client.query('UPDATE projects SET lead_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[]) AND lead_name = $2', [removedProjectIds, user.rows[0].fullName]);
  if (input.projectIds.length > 0) await client.query('DELETE FROM user_projects WHERE project_id = ANY($1::int[]) AND user_id <> $2', [input.projectIds, userId]);
  for (const projectId of input.projectIds) await client.query('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2);', [userId, projectId]);
  if (input.projectIds.length > 0) await client.query('UPDATE projects SET lead_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])', [input.projectIds, user.rows[0].fullName]);
}

export async function createManagedUser(input: UserInput): Promise<ManagedUser> {
  const passwordHash = await bcrypt.hash(input.password!, PASSWORD_HASH_ROUNDS);
  const client = await getClient();
  let userId = 0;
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(`
      INSERT INTO users (email, full_name, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `, [input.email, input.fullName, passwordHash, input.role, input.isActive]);
    userId = result.rows[0].id;
    await replacePermissions(client, userId, input);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return (await listManagedUsers()).find((user) => user.id === userId)!;
}

export async function updateManagedUser(id: number, input: UserInput): Promise<ManagedUser | null> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: number }>(`
      UPDATE users SET email = $2, full_name = $3, role = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id;
    `, [id, input.email, input.fullName, input.role, input.isActive]);
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }
    await replacePermissions(client, id, input);
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return (await listManagedUsers()).find((user) => user.id === id) ?? null;
}

export async function resetUserPassword(id: number, password: string, actorUserId: number): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
  const result = await pool.query('UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;', [id, passwordHash]);
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
  const emails = usernames.map((username) => `${username}@mbbank.com.vn`);
  const hashes = await Promise.all(usernames.map(() => bcrypt.hash(BULK_USER_DEFAULT_PASSWORD, PASSWORD_HASH_ROUNDS)));
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ email: string }>('SELECT email FROM users WHERE email = ANY($1::text[])', [emails]);
    const existingEmails = new Set(existing.rows.map((row) => row.email));
    const created: string[] = [];
    const skipped: string[] = [];
    for (let index = 0; index < usernames.length; index += 1) {
      if (existingEmails.has(emails[index])) { skipped.push(usernames[index]); continue; }
      await client.query('INSERT INTO users (email, full_name, password_hash, role, is_active) VALUES ($1, $2, $3, $4, FALSE)', [emails[index], usernames[index], hashes[index], 'USER']);
      created.push(usernames[index]);
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
    const users = await client.query<{ id: number }>('SELECT id FROM users WHERE id = ANY($1::int[]) AND is_active = FALSE FOR UPDATE', [ids]);
    if (users.rowCount !== ids.length) throw new Error('INVALID_USERS');
    const missingDomains = await client.query<{ id: number }>('SELECT u.id FROM users u WHERE u.id = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM user_domains ud WHERE ud.user_id = u.id)', [ids]);
    const missingDomainIds = missingDomains.rows.map((user) => user.id);
    if (missingDomainIds.length > 0) {
      if (!domainId) throw new Error('DOMAIN_REQUIRED');
      const domain = await client.query('SELECT id FROM domains WHERE id = $1 AND is_active = TRUE', [domainId]);
      if (domain.rowCount !== 1) throw new Error('INVALID_DOMAIN');
      await client.query('INSERT INTO user_domains (user_id, domain_id) SELECT selected.id, $2 FROM unnest($1::int[]) AS selected(id) ON CONFLICT DO NOTHING', [missingDomainIds, domainId]);
    }
    stage = 'COMPLETE';
    await client.query('UPDATE users SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::int[]) AND is_active = FALSE', [ids]);
    await client.query('COMMIT');
    return { approved: users.rows.length, domainAssigned: missingDomainIds.length };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const isKnownBusinessError = error instanceof Error && ['DOMAIN_REQUIRED', 'INVALID_DOMAIN', 'INVALID_USERS'].includes(error.message);
    const isDatabaseConflict = typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
    if (isKnownBusinessError || isDatabaseConflict || error instanceof ApprovalError) throw error;
    const databaseCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
    console.error('User approval transaction failed', { databaseCode, stage });
    throw new ApprovalError(stage);
  } finally { client.release(); }
}
