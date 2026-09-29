import 'server-only';
import pool from '@/lib/db';

export type ScoringEngineMode = 'legacy' | 'scoring';

export interface ScoringEngineSettings {
  mode: ScoringEngineMode;
  updatedAt: string | null;
  updatedByName: string | null;
}

/** Read on nearly every Epic request — cached per server instance for a short while (a switch made
 * on another instance shows up within this window; the switch itself also rebuilds the caches). */
const CACHE_TTL_MS = 30_000;
let cached: { mode: ScoringEngineMode; expiresAt: number } | null = null;

export async function getScoringEngineSettings(): Promise<ScoringEngineSettings> {
  const result = await pool.query<ScoringEngineSettings>(`
    SELECT s.mode, s.updated_at::text AS "updatedAt", u.full_name AS "updatedByName"
    FROM scoring_engine_settings s
    LEFT JOIN users u ON u.id = s.updated_by_user_id
    WHERE s.id = 1;
  `);
  return result.rows[0] ?? { mode: 'legacy', updatedAt: null, updatedByName: null };
}

/** The engine stored in the database (what production reads and what the shared caches are built
 * with). Falls back to 'legacy' if the setting can't be read (e.g. the migration hasn't run on this
 * database yet) — never breaks a screen. */
export async function getStoredScoringEngineMode(): Promise<ScoringEngineMode> {
  if (cached && cached.expiresAt > Date.now()) return cached.mode;
  try {
    const { mode } = await getScoringEngineSettings();
    cached = { mode, expiresAt: Date.now() + CACHE_TTL_MS };
    return mode;
  } catch (error: unknown) {
    console.error('Could not read scoring engine mode, using legacy:', error);
    return 'legacy';
  }
}

/** Which engine the screens display on this server: SCORING_ENGINE_MODE in .env.local (per-machine
 * override, lets a developer preview either engine against the shared hosted database) or else the
 * stored setting. Only for READING — anything written to the shared caches must follow
 * getStoredScoringEngineMode, or a developer's preview would leak into production. */
export async function getScoringEngineMode(): Promise<ScoringEngineMode> {
  const override = process.env.SCORING_ENGINE_MODE;
  if (override === 'legacy' || override === 'scoring') return override;
  return getStoredScoringEngineMode();
}

export async function setScoringEngineMode(mode: ScoringEngineMode, userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO scoring_engine_settings (id, mode, updated_at, updated_by_user_id) VALUES (1, $1, NOW(), $2)
     ON CONFLICT (id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW(), updated_by_user_id = EXCLUDED.updated_by_user_id;`,
    [mode, userId],
  );
  cached = { mode, expiresAt: Date.now() + CACHE_TTL_MS };
}
