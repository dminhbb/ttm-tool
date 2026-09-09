import pool from '@/lib/db';
import type { ApiKey, ApiKeyInput } from '@/lib/api-key-types';

const SELECT_COLUMNS = `
  id,
  key_name AS "keyName",
  app_name AS "appName",
  api_key AS "apiKey",
  is_active AS "isActive",
  is_unlimited AS "isUnlimited",
  valid_from::text AS "validFrom",
  valid_to::text AS "validTo",
  created_at::text AS "createdAt",
  updated_at::text AS "updatedAt"
`;

export async function listApiKeys(): Promise<ApiKey[]> {
  const result = await pool.query<ApiKey>(`
    SELECT ${SELECT_COLUMNS} FROM api_keys
    ORDER BY created_at DESC;
  `);
  return result.rows;
}

export async function getApiKeyById(id: number): Promise<ApiKey | null> {
  const result = await pool.query<ApiKey>(`
    SELECT ${SELECT_COLUMNS} FROM api_keys WHERE id = $1;
  `, [id]);
  return result.rows[0] ?? null;
}

export async function createApiKey(input: ApiKeyInput): Promise<ApiKey> {
  const result = await pool.query<ApiKey>(`
    INSERT INTO api_keys (key_name, app_name, api_key, is_active, is_unlimited, valid_from, valid_to)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${SELECT_COLUMNS};
  `, [
    input.keyName.trim(),
    input.appName.trim(),
    input.apiKey.trim(),
    input.isActive,
    input.isUnlimited,
    input.isUnlimited ? null : (input.validFrom || null),
    input.isUnlimited ? null : (input.validTo || null),
  ]);
  return result.rows[0];
}

export async function updateApiKey(id: number, input: ApiKeyInput): Promise<ApiKey | null> {
  const result = await pool.query<ApiKey>(`
    UPDATE api_keys SET
      key_name = $2,
      app_name = $3,
      api_key = $4,
      is_active = $5,
      is_unlimited = $6,
      valid_from = $7,
      valid_to = $8,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING ${SELECT_COLUMNS};
  `, [
    id,
    input.keyName.trim(),
    input.appName.trim(),
    input.apiKey.trim(),
    input.isActive,
    input.isUnlimited,
    input.isUnlimited ? null : (input.validFrom || null),
    input.isUnlimited ? null : (input.validTo || null),
  ]);
  return result.rows[0] ?? null;
}

export async function deleteApiKey(id: number): Promise<boolean> {
  const result = await pool.query(`
    DELETE FROM api_keys WHERE id = $1;
  `, [id]);
  return (result.rowCount ?? 0) > 0;
}
