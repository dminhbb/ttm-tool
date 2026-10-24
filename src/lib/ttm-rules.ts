import type { EpicComplexityType } from '@/lib/status-alert-rule-types';

/** Alias of EpicComplexityType (status-alert-rule-types.ts) — kept as its own exported name since
 * most of this codebase imports "EpicComplexity" from here, not from status-alert-rule-types.ts.
 * The rules themselves (alert offsets, TTM budgets, Release grace…) live in the Epic Scoring Service
 * (src/lib/scoring). */
export type EpicComplexity = EpicComplexityType;
export type AlertLevel = 'NONE' | 'EARLY' | 'LATE' | 'FAIL';
