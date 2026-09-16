import 'server-only';
import { createHash, randomBytes } from 'crypto';
import pool from '@/lib/db';
import type { ConsumeAuthorizationCodeResult, McpOAuthClient } from '@/lib/mcp-oauth-types';

const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
const CIMD_FETCH_TIMEOUT_MS = 5000;

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A Client ID Metadata Document client (see https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/)
 * uses the metadata document's own URL as its client_id — that's how claude.ai's default "Use
 * Anthropic's hosted client metadata" option identifies itself, with no registration step. */
function isClientIdMetadataUrl(clientId: string): boolean {
  return isAbsoluteHttpUrl(clientId);
}

export async function registerOAuthClient(clientName: string, redirectUris: string[]): Promise<McpOAuthClient> {
  const clientId = randomBytes(16).toString('hex');
  await pool.query(
    'INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3::jsonb);',
    [clientId, clientName, JSON.stringify(redirectUris)],
  );
  return { clientId, clientName, redirectUris };
}

async function getRegisteredOAuthClient(clientId: string): Promise<McpOAuthClient | null> {
  const result = await pool.query<{ clientId: string; clientName: string; redirectUris: string[] }>(`
    SELECT client_id AS "clientId", client_name AS "clientName", redirect_uris AS "redirectUris"
    FROM mcp_oauth_clients WHERE client_id = $1;
  `, [clientId]);
  return result.rows[0] ?? null;
}

async function resolveClientIdMetadataDocument(clientId: string): Promise<McpOAuthClient | null> {
  try {
    const response = await fetch(clientId, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const metadata: unknown = await response.json();
    if (typeof metadata !== 'object' || metadata === null) return null;
    const record = metadata as Record<string, unknown>;
    const redirectUris = record.redirect_uris;
    if (!Array.isArray(redirectUris) || !redirectUris.every((uri) => typeof uri === 'string')) return null;
    const clientName = typeof record.client_name === 'string' ? record.client_name : clientId;
    return { clientId, clientName, redirectUris };
  } catch {
    return null;
  }
}

/** Resolves an OAuth client_id from either registration path the "Add custom connector" dialog
 * offers: a URL means Client ID Metadata Document (fetched live, not stored), anything else is
 * looked up among clients that went through Dynamic Client Registration (registerOAuthClient). */
export async function resolveOAuthClient(clientId: string): Promise<McpOAuthClient | null> {
  if (isClientIdMetadataUrl(clientId)) return resolveClientIdMetadataDocument(clientId);
  return getRegisteredOAuthClient(clientId);
}

export async function createAuthorizationCode(params: {
  clientId: string;
  clientName: string;
  codeChallenge: string;
  redirectUri: string;
  userId: number;
}): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS);
  await pool.query(`
    INSERT INTO mcp_oauth_authorization_codes (code, client_id, client_name, user_id, redirect_uri, code_challenge, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
  `, [code, params.clientId, params.clientName, params.userId, params.redirectUri, params.codeChallenge, expiresAt]);
  return code;
}

export async function consumeAuthorizationCode(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<ConsumeAuthorizationCodeResult> {
  const result = await pool.query<{
    clientId: string; clientName: string; codeChallenge: string; redirectUri: string; userId: number;
  }>(`
    UPDATE mcp_oauth_authorization_codes
    SET used_at = CURRENT_TIMESTAMP
    WHERE code = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    RETURNING client_id AS "clientId", client_name AS "clientName", code_challenge AS "codeChallenge", redirect_uri AS "redirectUri", user_id AS "userId";
  `, [params.code]);
  const row = result.rows[0];
  if (!row || row.clientId !== params.clientId || row.redirectUri !== params.redirectUri) {
    return { error: 'invalid_grant' };
  }

  const expectedChallenge = createHash('sha256').update(params.codeVerifier).digest('base64url');
  if (expectedChallenge !== row.codeChallenge) return { error: 'invalid_grant' };

  return { ok: true, clientName: row.clientName, userId: row.userId };
}
