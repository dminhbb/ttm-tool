/**
 * "Tìm nhanh Epic" (owner 2026-11-11, key F on any page) — the rules shared by the floating box (EpicQuickSearch.tsx) and
 * the API (/api/epic-search). Pure, no database import.
 *
 * Security: an Epic key keyword is only letters, digits and "-" (e.g. "MO-", "34035", "MO-340"), at most 40 characters.
 * The box strips every other character as it is typed or pasted (sanitizeEpicSearchInput); the API refuses anything else
 * (isValidEpicSearchKeyword → 400) and binds the keyword as a query parameter — it is never spliced into SQL, and since
 * it holds no "%" / "_" / "\" it cannot widen the LIKE pattern either. The page renders results as text (React escapes).
 */

export const EPIC_SEARCH_MAX_LENGTH = 40;
export const EPIC_SEARCH_MAX_RESULTS = 5;
/** The box searches by itself after this pause in typing (or at once on Enter). */
export const EPIC_SEARCH_IDLE_MS = 3000;

const ALLOWED = /^[A-Za-z0-9-]+$/;

/** Keeps only A–Z, a–z, 0–9 and "-", capped at EPIC_SEARCH_MAX_LENGTH. */
export function sanitizeEpicSearchInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9-]/g, '').slice(0, EPIC_SEARCH_MAX_LENGTH);
}

/** A keyword the API accepts: 1–40 characters, letters / digits / "-" only, not only dashes. */
export function isValidEpicSearchKeyword(value: string): boolean {
  return value.length > 0 && value.length <= EPIC_SEARCH_MAX_LENGTH && ALLOWED.test(value) && /[A-Za-z0-9]/.test(value);
}

export interface EpicSearchHit {
  epicKey: string;
  epicName: string;
  status: string;
  /** Created date of the Epic (jira_created_at of its newest version) — the order of the suggestions. */
  createdDate: string | null;
}
