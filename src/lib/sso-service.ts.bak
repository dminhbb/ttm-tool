import { randomBytes } from 'crypto';
import pool from '@/lib/db';
import type { ApiKey } from '@/lib/api-key-types';
import type { UserRole } from '@/lib/auth-types';

export interface SsoClientValidation {
  apiKey: ApiKey;
  isValid: boolean;
  reason?: string;
}

export interface SsoUser {
  email: string;
  fullName: string;
  id: number;
  role: UserRole;
}

export type SsoExchangeResult =
  | {
      appName: string;
      success: true;
      user: SsoUser;
    }
  | {
      error: 'INVALID_API_KEY' | 'CODE_NOT_FOUND' | 'CODE_ALREADY_USED' | 'CODE_EXPIRED' | 'USER_INACTIVE' | 'CLIENT_INACTIVE';
      success: false;
    };

/**
 * Validate an API key / client_id for SSO authorization.
 */
export async function validateSsoClient(apiKeyString: string): Promise<SsoClientValidation> {
  const trimmed = apiKeyString.trim();
  if (!trimmed) {
    return { isValid: false, reason: 'API Key không được để trống.', apiKey: null as any };
  }

  const result = await pool.query<ApiKey>(`
    SELECT
      id,
      key_name AS "keyName",
      app_name AS "appName",
      api_key AS "apiKey",
      is_active AS "isActive",
      is_unlimited AS "isUnlimited",
      valid_from::text AS "validFrom",
      valid_to::text AS "validTo"
    FROM api_keys
    WHERE api_key = $1;
  `, [trimmed]);

  const key = result.rows[0];
  if (!key) {
    return { isValid: false, reason: 'API Key (client_id) không tồn tại trên hệ thống.', apiKey: null as any };
  }

  if (!key.isActive) {
    return { isValid: false, reason: 'API Key (client_id) đang ở trạng thái tạm khóa (Inactive).', apiKey: key };
  }

  if (!key.isUnlimited) {
    const today = new Date().toISOString().slice(0, 10);
    if (key.validFrom && key.validFrom > today) {
      return { isValid: false, reason: `API Key chưa đến ngày hiệu lực (Từ ngày: ${key.validFrom}).`, apiKey: key };
    }
    if (key.validTo && key.validTo < today) {
      return { isValid: false, reason: `API Key đã hết hạn sử dụng (Đến ngày: ${key.validTo}).`, apiKey: key };
    }
  }

  return { isValid: true, apiKey: key };
}

/**
 * Generate a single-use authorization code for SSO (expires in 5 minutes).
 */
export async function generateAuthorizationCode(
  apiKeyId: number,
  userId: number,
  redirectUri: string
): Promise<string> {
  const code = `ttm_ac_${randomBytes(24).toString('hex')}`;
  
  await pool.query(`
    INSERT INTO sso_auth_codes (code, api_key_id, user_id, redirect_uri, expires_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '5 minutes');
  `, [code, apiKeyId, userId, redirectUri]);

  return code;
}

/**
 * Exchange single-use authorization code for User Profile info.
 */
export async function exchangeCodeForUser(
  code: string,
  apiKeyString: string
): Promise<SsoExchangeResult> {
  const trimmedCode = code.trim();
  const trimmedApiKey = apiKeyString.trim();

  if (!trimmedCode || !trimmedApiKey) {
    return { success: false, error: 'INVALID_API_KEY' };
  }

  const result = await pool.query<{
    apiKey: string;
    apiKeyId: number;
    apiKeyIsActive: boolean;
    appName: string;
    email: string;
    expiresAt: string;
    fullName: string;
    id: number;
    isUsed: boolean;
    redirectUri: string;
    role: UserRole;
    userId: number;
    userIsActive: boolean;
  }>(`
    SELECT
      c.id,
      c.is_used AS "isUsed",
      c.expires_at::text AS "expiresAt",
      c.redirect_uri AS "redirectUri",
      u.id AS "userId",
      u.email,
      u.full_name AS "fullName",
      u.role,
      u.is_active AS "userIsActive",
      k.id AS "apiKeyId",
      k.api_key AS "apiKey",
      k.app_name AS "appName",
      k.is_active AS "apiKeyIsActive"
    FROM sso_auth_codes c
    JOIN api_keys k ON c.api_key_id = k.id
    JOIN users u ON c.user_id = u.id
    WHERE c.code = $1;
  `, [trimmedCode]);

  const row = result.rows[0];
  if (!row) {
    return { success: false, error: 'CODE_NOT_FOUND' };
  }

  if (row.apiKey !== trimmedApiKey) {
    return { success: false, error: 'INVALID_API_KEY' };
  }

  if (!row.apiKeyIsActive) {
    return { success: false, error: 'CLIENT_INACTIVE' };
  }

  if (row.isUsed) {
    return { success: false, error: 'CODE_ALREADY_USED' };
  }

  const expiresDate = new Date(row.expiresAt);
  if (Date.now() > expiresDate.getTime()) {
    return { success: false, error: 'CODE_EXPIRED' };
  }

  if (!row.userIsActive) {
    return { success: false, error: 'USER_INACTIVE' };
  }

  // Mark code as used
  await pool.query('UPDATE sso_auth_codes SET is_used = TRUE WHERE id = $1;', [row.id]);

  return {
    success: true,
    appName: row.appName,
    user: {
      id: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
    },
  };
}
