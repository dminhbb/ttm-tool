import { BADGE_BY_ID, badgesOf, type BadgeId } from '@/lib/scoring/catalog';
import { EPIC_ANOMALY_RULE_INDEX } from '@/lib/epic-data-anomaly';
import type { EpicAnomalyViolation } from '@/lib/epic-alert-types';

/**
 * "Chuẩn hoá dữ liệu" — one panel per "Sai lệch dữ liệu" rule (the ALERT badges of the DATA_QUALITY
 * axis of the scoring catalog: R1, R3–R6, R8–R10), each listing the Epics that currently break it.
 * An Epic breaking several rules appears in several panels (owner decision 2026-10-12).
 *
 * Pure — the Epic rows and their dates come from data-normalization-service.ts.
 */

/** Epics per page of every panel (same menu/paging as "Quản trị Epic", 25 per page). */
export const NORMALIZATION_PAGE_SIZE = 25;

/** Rule badge → the recommendation badge that says how to fix it (single source: the catalog). */
const GUIDE_BADGE_OF_RULE: Partial<Record<number, BadgeId>> = {
  1: 'REC_FILL_START_DATE',
  3: 'REC_FIX_DATE_ORDER',
  4: 'REC_FILL_REQUEST_TYPE',
  5: 'REC_FILL_REQUIREMENT_LEVEL',
  6: 'REC_REVIEW_SP_LEVEL',
  8: 'REC_FIX_R4G_STATUS',
  9: 'REC_FILL_R4G_DATE',
  10: 'REC_CLEAR_FUTURE_R4G_DATE',
};

export interface NormalizationRuleDefinition {
  /** 'R1', 'R3'… — also the key of the page map in the API. */
  code: string;
  /** Rule title. */
  label: string;
  /** What the rule checks. */
  meaning: string;
  /** The rule's formula, as the "Logic cảnh báo" popup shows it. */
  formula: string;
  /** How to normalize the data (recommendation badge text) — '' when the catalog has none. */
  guide: string;
  index: number;
  /** false for rules only the Scoring Service has (R8–R10): the legacy engine never emits them. */
  inLegacyEngine: boolean;
}

/** Rules in R-number order. */
export const NORMALIZATION_RULES: readonly NormalizationRuleDefinition[] = badgesOf('DATA_QUALITY', 'ALERT')
  .map((badge) => {
    const index = Number(/^ANOMALY_R(\d+)_/.exec(badge.id)?.[1] ?? 0);
    const guideBadge = GUIDE_BADGE_OF_RULE[index];
    return {
      code: `R${index}`,
      formula: badge.formula,
      guide: guideBadge ? BADGE_BY_ID.get(guideBadge)?.meaning ?? '' : '',
      inLegacyEngine: Boolean(badge.legacySource),
      index,
      label: badge.label,
      meaning: badge.meaning,
    };
  })
  .filter((rule) => rule.index > 0)
  .sort((a, b) => a.index - b.index);

/** The rule numbers (1, 3, 4…) this Epic currently breaks. */
export function brokenRuleIndexes(violations: readonly Pick<EpicAnomalyViolation, 'code'>[] | null | undefined): Set<number> {
  const indexes = new Set<number>();
  for (const violation of violations ?? []) {
    const index = EPIC_ANOMALY_RULE_INDEX[violation.code];
    if (index) indexes.add(index);
  }
  return indexes;
}

/** Parses "R1:2,R5:3" (rule code : 1-based page) — unknown codes and bad pages are dropped. */
export function parseNormalizationPages(raw: string | null | undefined): Record<string, number> {
  const pages: Record<string, number> = {};
  for (const part of (raw ?? '').split(',')) {
    const [code, value] = part.split(':').map((item) => item.trim());
    const page = Number(value);
    if (/^R\d+$/.test(code ?? '') && Number.isInteger(page) && page >= 1) pages[code] = page;
  }
  return pages;
}

/** Orders Epic keys the way people read them: by project, then by number (API-2 before API-10). */
export function compareEpicKeys(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

export interface NormalizationEpicRow {
  createdDate: string | null;
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  ideaApprovedDate: string | null;
  r4gDate: string | null;
  startDate: string | null;
  status: string;
  /** The messages of the violations of THIS panel's rule. */
  violations: string[];
}

export interface NormalizationPanel {
  code: string;
  formula: string;
  guide: string;
  inLegacyEngine: boolean;
  label: string;
  meaning: string;
  /** 1-based, clamped to the last page. */
  page: number;
  pageSize: number;
  rows: NormalizationEpicRow[];
  totalCount: number;
  totalPages: number;
}

/** Slices one rule's (already sorted) Epics into its requested page. */
export function paginate<T>(items: readonly T[], requestedPage: number, pageSize = NORMALIZATION_PAGE_SIZE): { page: number; rows: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  return { page, rows: items.slice((page - 1) * pageSize, page * pageSize), totalPages };
}
