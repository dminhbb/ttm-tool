import 'server-only';
import { createHash, randomBytes } from 'crypto';
import pool from '@/lib/db';
import type { AuthUser } from '@/lib/auth-types';
import type { McpAccessToken, McpAccessTokenCreated, McpSettings, McpTopUser, McpUsageSummary } from '@/lib/mcp-types';

const TOKEN_PREFIX = 'ttm_mcp_';
/** Same rolling-window idea as USAGE_STATS_RETENTION_DAYS in usage-stats-service.ts — a day's row
 * ages out once it's more than this many days old, purged opportunistically on every write. */
const ACCESS_STATS_RETENTION_DAYS = 90;

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
}

const TOKEN_COLUMNS = `
  id,
  token_name AS "tokenName",
  token_prefix AS "tokenPrefix",
  created_at::text AS "createdAt",
  last_used_at::text AS "lastUsedAt",
  revoked_at::text AS "revokedAt"
`;

export async function getMcpSettings(): Promise<McpSettings> {
  const result = await pool.query<McpSettings>(`
    SELECT is_enabled AS "isEnabled", updated_at::text AS "updatedAt" FROM mcp_settings WHERE id = 1;
  `);
  return result.rows[0] ?? { isEnabled: false, updatedAt: null };
}

export async function setMcpEnabled(isEnabled: boolean, updatedByUserId: number): Promise<McpSettings> {
  const result = await pool.query<McpSettings>(`
    UPDATE mcp_settings
    SET is_enabled = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
    WHERE id = 1
    RETURNING is_enabled AS "isEnabled", updated_at::text AS "updatedAt";
  `, [isEnabled, updatedByUserId]);
  return result.rows[0];
}

export async function listPersonalAccessTokens(userId: number): Promise<McpAccessToken[]> {
  const result = await pool.query<McpAccessToken>(`
    SELECT ${TOKEN_COLUMNS} FROM mcp_access_tokens WHERE user_id = $1 ORDER BY created_at DESC;
  `, [userId]);
  return result.rows;
}

export async function createPersonalAccessToken(userId: number, tokenName: string): Promise<McpAccessTokenCreated> {
  const token = generateToken();
  const tokenPrefix = token.slice(0, TOKEN_PREFIX.length + 6);
  const result = await pool.query<McpAccessToken>(`
    INSERT INTO mcp_access_tokens (user_id, token_name, token_prefix, token_hash)
    VALUES ($1, $2, $3, $4)
    RETURNING ${TOKEN_COLUMNS};
  `, [userId, tokenName, tokenPrefix, hashToken(token)]);
  return { ...result.rows[0], token };
}

export async function revokePersonalAccessToken(userId: number, tokenId: number): Promise<boolean> {
  const result = await pool.query(`
    UPDATE mcp_access_tokens SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL;
  `, [tokenId, userId]);
  return (result.rowCount ?? 0) > 0;
}

async function purgeExpiredMcpAccessStats(): Promise<void> {
  await pool.query('DELETE FROM mcp_access_daily_stats WHERE stat_date < CURRENT_DATE - $1::int;', [ACCESS_STATS_RETENTION_DAYS - 1]);
}

/** Called on every authenticated MCP tool call (wired up once the actual /api/mcp route ships) —
 * bumps today's per-user counter and the token's last-used timestamp. */
export async function recordMcpAccessEvent(userId: number, tokenId: number): Promise<void> {
  await pool.query(`
    INSERT INTO mcp_access_daily_stats (user_id, stat_date, access_count)
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (user_id, stat_date) DO UPDATE SET access_count = mcp_access_daily_stats.access_count + 1;
  `, [userId]);
  await pool.query('UPDATE mcp_access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1;', [tokenId]);
  await purgeExpiredMcpAccessStats();
}

/** Resolves a raw bearer token (as presented by an MCP client) to the owning, still-active user —
 * for the MCP transport's own auth check once that route exists. Returns null on any mismatch:
 * unknown token, revoked token, or a since-deactivated user. */
export async function verifyMcpAccessToken(rawToken: string): Promise<{ tokenId: number; user: AuthUser } | null> {
  const result = await pool.query<AuthUser & { tokenId: number }>(`
    SELECT u.id, u.email, u.full_name AS "fullName", u.role, t.id AS "tokenId"
    FROM mcp_access_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND u.is_active = TRUE;
  `, [hashToken(rawToken)]);
  const row = result.rows[0];
  if (!row) return null;
  const { tokenId, ...user } = row;
  return { tokenId, user };
}

export async function getMcpUsageSummary(): Promise<McpUsageSummary> {
  const [issuedResult, activeResult, weeklyResult, topUsersResult] = await Promise.all([
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM mcp_access_tokens;'),
    pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM mcp_access_tokens WHERE revoked_at IS NULL;'),
    pool.query<{ total: string }>(`
      SELECT COALESCE(SUM(access_count), 0)::text AS total
      FROM mcp_access_daily_stats
      WHERE stat_date >= CURRENT_DATE - 6;
    `),
    pool.query<McpTopUser>(`
      SELECT u.id AS "userId", u.full_name AS "fullName", u.email, SUM(s.access_count)::int AS "accessCount"
      FROM mcp_access_daily_stats s
      JOIN users u ON u.id = s.user_id
      WHERE s.stat_date >= CURRENT_DATE - $1::int
      GROUP BY u.id, u.full_name, u.email
      ORDER BY "accessCount" DESC
      LIMIT 5;
    `, [ACCESS_STATS_RETENTION_DAYS - 1]),
  ]);
  return {
    issuedTokenCount: Number(issuedResult.rows[0]?.count ?? 0),
    activeTokenCount: Number(activeResult.rows[0]?.count ?? 0),
    weeklyAccessCount: Number(weeklyResult.rows[0]?.total ?? 0),
    topUsers: topUsersResult.rows,
  };
}
