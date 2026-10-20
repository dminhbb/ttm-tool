/**
 * Username = the local part of a user's @mbbank.com.vn email, lower-cased (owner rule 2026-10-19 —
 * the unique index idx_users_unique_username enforces it on users). The one place this rule lives:
 * pure (no db, no server-only import) so the API routes, server services and client screens all share
 * it. SQL that needs the same value uses SPLIT_PART(LOWER(email), '@', 1).
 */
export function extractUsername(value: string): string {
  return value.trim().toLowerCase().split('@')[0];
}

/** The full @mbbank.com.vn email of a username (or of an email typed with any domain); '' when empty. */
export function normalizeUsername(value: string): string {
  const username = extractUsername(value);
  return username ? `${username}@mbbank.com.vn` : '';
}
