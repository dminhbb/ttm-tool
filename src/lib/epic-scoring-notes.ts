import { BADGE_BY_ID, SCORING_AXES } from '@/lib/scoring/catalog';
import type { BadgeId, FindingGroup, ScoringAxis } from '@/lib/scoring/catalog';
import type { Finding } from '@/lib/scoring/types';

/**
 * Tab "Scoring" of the Review Notes popup (owner 2026-10-28): every badge the Scoring Service has ACTIVE on the Epic —
 * Đạt / Fail TTM-CNTT and TTM-E2E included — one row each, with the rule's own explanation (the finding's message).
 * Pure: reads the scorecard stored in epic_alert_row_cache (`findings` + `badge_codes`), the same one the list shows.
 */

export interface ScoringNote {
  /** Badge id, subject-qualified for a phase badge (e.g. "PHASE_LATE:DEV"). Unique within the list. */
  key: string;
  badge: string;
  /** Catalog label, with the phase for a phase badge — e.g. "Trễ pha (DEV)". */
  label: string;
  group: FindingGroup;
  axis: ScoringAxis | null;
  message: string;
}

/** Most important first: verdicts that failed, alerts, what to do, verdicts that passed, neutral notes. */
const GROUP_ORDER: readonly FindingGroup[] = ['FAIL', 'ALERT', 'RECOMMENDATION', 'PASS', 'NOTE'];
const AXIS_ORDER: readonly ScoringAxis[] = SCORING_AXES.map((axis) => axis.id);

/** Rule messages write ISO dates ("2026-02-20"); the popup shows dd/MM/yyyy like the rest of the screen. */
export function viDates(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');
}

function rank<T>(order: readonly T[], value: T | null | undefined): number {
  const index = value === null || value === undefined ? -1 : order.indexOf(value);
  return index < 0 ? order.length : index;
}

/**
 * `activeBadgeCodes` = the scorecard's active badges (badge_codes: bare and subject-qualified). A finding that a
 * suppression hides, or whose badge is switched off, is left out — exactly what the list itself shows.
 */
export function scoringNotesOf(findings: readonly Finding[] | null | undefined, activeBadgeCodes: readonly string[] | null | undefined): ScoringNote[] {
  const active = new Set(activeBadgeCodes ?? []);
  const notes = new Map<string, ScoringNote>();
  const precedenceOf = new Map<string, number>();
  for (const finding of findings ?? []) {
    if (finding.suppressedBy && finding.suppressedBy.length > 0) continue;
    const key = finding.subject ? `${finding.badge}:${finding.subject}` : finding.badge;
    if (!active.has(key) || notes.has(key)) continue;
    const definition = BADGE_BY_ID.get(finding.badge as BadgeId);
    const baseLabel = definition?.label ?? finding.badge;
    notes.set(key, {
      key,
      badge: finding.badge,
      label: finding.subject ? `${baseLabel} (${finding.subject})` : baseLabel,
      group: definition?.group ?? 'NOTE',
      axis: definition?.axis ?? null,
      message: viDates(finding.message),
    });
    precedenceOf.set(key, definition?.precedence ?? Number.MAX_SAFE_INTEGER);
  }
  return [...notes.values()].sort((a, b) => rank(GROUP_ORDER, a.group) - rank(GROUP_ORDER, b.group)
    || rank(AXIS_ORDER, a.axis) - rank(AXIS_ORDER, b.axis)
    || (precedenceOf.get(a.key) ?? 0) - (precedenceOf.get(b.key) ?? 0)
    || a.key.localeCompare(b.key));
}
