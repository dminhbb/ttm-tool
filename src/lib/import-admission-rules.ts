import type { RawJiraIssue } from '@/lib/csv-parser';
import { getIssueHierarchyLevel } from '@/lib/issue-hierarchy';

/**
 * "Từ chối import" — which Epics the import adapter keeps out of the database (owner 2026-10-14).
 * The Jira crawl cannot yet filter at the source, so the data scope is enforced here:
 *
 *   - an Epic listed in denied_import_epics (allow_import = FALSE) is always denied;
 *   - an Epic listed with allow_import = TRUE ("Cho phép import") is exempt from the rules below;
 *   - any other Epic is denied when it breaks one of the automatic rules:
 *       NOT_EPIC_TYPE   — level-1 issue type other than Epic (CTNB, YCPT…);
 *       CREATED_BEFORE  — created before A;
 *       RELEASED_BEFORE — Released / MVP Done and got there before B. The crawl does not export the
 *                         date of the status change yet (column epic_status_changed_at); until it
 *                         does, the Due Date stands in for it, and the R4G Date when Due is empty.
 *                         Never applied to an Epic the database saw in another status on/after B:
 *                         that proves it got to Released after B (e.g. DL-65580, due 25/06 but
 *                         Released 10/09 — found while scanning, 2026-10-14).
 *
 * A denied Epic takes every row of its branch with it (its Stories and their Subtasks).
 *
 * Kept out of the Scoring Service (src/lib/scoring/) on purpose — owner decision 2026-10-14: this is
 * a gate on what enters the database, not a verdict shown on a screen (no badge, no parity run).
 * Pure: no db, no clock.
 */

export interface ImportAdmissionSettings {
  /** A — yyyy-mm-dd; null turns CREATED_BEFORE off. */
  createdBefore: string | null;
  /** B — yyyy-mm-dd; null turns RELEASED_BEFORE off. */
  releasedDueBefore: string | null;
}

export type AdmissionRuleCode = 'CREATED_BEFORE' | 'NOT_EPIC_TYPE' | 'RELEASED_BEFORE';

export interface AdmissionViolation {
  code: AdmissionRuleCode;
  message: string;
}

/** What the rules read of an Epic — dates as yyyy-mm-dd (Vietnam calendar day) or null. */
export interface AdmissionEpicFacts {
  createdDate: string | null;
  dueDate: string | null;
  /** Level-1 issue type as Jira names it ('Epic', 'CTNB', 'YCPT'…). */
  issueType: string;
  r4gDate: string | null;
  status: string;
  /** Date the Epic moved to its current status, when the source exports it. */
  statusChangedDate: string | null;
  /**
   * Last day the database saw the Epic in a status other than Released / MVP Done (RAW or snapshot
   * layers). On/after B it proves the Epic got to Released after B, whatever its Due Date says.
   */
  lastUnreleasedSeenDate?: string | null;
}

const RELEASED_STATUSES = new Set(['RELEASED', 'MVP DONE']);

function normalizeLabel(value: string): string {
  return value.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

/** Released or MVP Done, whatever the spelling ('MVP Done', 'MVP DONE', 'MVPDONE'). */
export function isReleasedStatus(status: string): boolean {
  const normalized = normalizeLabel(status);
  return RELEASED_STATUSES.has(normalized === 'MVPDONE' ? 'MVP DONE' : normalized);
}

function formatViDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

const VIETNAM_DAY = new Intl.DateTimeFormat('en-CA', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' });

/** Calendar day (yyyy-mm-dd) of an instant in Vietnam — Jira's dates are Vietnam days. */
export function vietnamIsoDate(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return VIETNAM_DAY.format(value);
}

export function evaluateImportAdmission(facts: AdmissionEpicFacts, settings: ImportAdmissionSettings): AdmissionViolation[] {
  const violations: AdmissionViolation[] = [];
  if (normalizeLabel(facts.issueType) !== 'EPIC') {
    violations.push({ code: 'NOT_EPIC_TYPE', message: `Issue type "${facts.issueType}" — chỉ nhận issue type Epic` });
  }
  if (settings.createdBefore && facts.createdDate && facts.createdDate < settings.createdBefore) {
    violations.push({ code: 'CREATED_BEFORE', message: `Created ${formatViDate(facts.createdDate)} trước ${formatViDate(settings.createdBefore)} (A)` });
  }
  const provenReleasedAfterB = Boolean(settings.releasedDueBefore && facts.lastUnreleasedSeenDate && facts.lastUnreleasedSeenDate >= settings.releasedDueBefore);
  if (settings.releasedDueBefore && isReleasedStatus(facts.status) && !provenReleasedAfterB) {
    const [field, date] = facts.statusChangedDate
      ? ['Ngày chuyển status', facts.statusChangedDate]
      : facts.dueDate ? ['Due Date', facts.dueDate] : ['R4G Date', facts.r4gDate];
    if (date && date < settings.releasedDueBefore) {
      violations.push({ code: 'RELEASED_BEFORE', message: `${facts.status} — ${field} ${formatViDate(date)} trước ${formatViDate(settings.releasedDueBefore)} (B)` });
    }
  }
  return violations;
}

/** One line per violation, as stored in denied_import_epics.reason. */
export function describeViolations(violations: readonly AdmissionViolation[]): string {
  return violations.map((violation) => violation.message).join('; ');
}

export interface AdmissionListEntry {
  allowImport: boolean;
}

export interface DeniedEpicInFile {
  epicKey: string;
  /** LIST: listed in Từ chối import; RULE: broke an automatic rule (not listed yet). */
  origin: 'LIST' | 'RULE';
  /** The Epic's own row in the file — null when only its Stories/Subtasks came in this file. */
  row: RawJiraIssue | null;
  violations: AdmissionViolation[];
}

export interface ImportAdmissionPlan {
  /** Rows let through, in file order. */
  admitted: RawJiraIssue[];
  /** Epics whose rows were dropped, in file order. */
  deniedEpics: DeniedEpicInFile[];
  deniedRowCount: number;
}

export function normalizeEpicKey(key: string): string {
  return key.trim().toLocaleUpperCase('en-US');
}

const EPIC_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Epic keys typed or pasted by an admin (comma, semicolon, space or newline separated), deduped. */
export function parseEpicKeyList(input: string | readonly string[]): { invalid: string[]; keys: string[] } {
  const tokens = (typeof input === 'string' ? input.split(/[\s,;]+/) : input).map(normalizeEpicKey).filter(Boolean);
  const keys = new Set<string>();
  const invalid = new Set<string>();
  for (const token of tokens) (EPIC_KEY_PATTERN.test(token) ? keys : invalid).add(token);
  return { invalid: [...invalid], keys: [...keys] };
}

/** Facts of an Epic's row of the import file (dates parsed by the caller's `toIsoDate`). */
export function admissionFactsOfRow(row: RawJiraIssue, toIsoDate: (raw: string) => string | null, lastUnreleasedSeenDate: string | null = null): AdmissionEpicFacts {
  return {
    createdDate: row.jiraCreatedAt ? toIsoDate(row.jiraCreatedAt) : null,
    dueDate: toIsoDate(row.dueDate),
    issueType: row.sourceIssueType || row.issueType,
    lastUnreleasedSeenDate,
    r4gDate: toIsoDate(row.r4gDate),
    status: row.status,
    statusChangedDate: row.statusChangedAt ? toIsoDate(row.statusChangedAt) : null,
  };
}

/**
 * Splits the rows of an import file into the admitted ones and the denied Epics. A Story is dropped
 * with its Epic (epicLink); a Subtask with its Epic (epicLink, Py Jira API) or with its Story
 * (parentId = Story key or numeric Jira id, Pure Jira Export).
 */
export function planImportAdmission(
  rows: readonly RawJiraIssue[],
  list: ReadonlyMap<string, AdmissionListEntry>,
  settings: ImportAdmissionSettings,
  toIsoDate: (raw: string) => string | null,
  /** Epic key → last day the database saw it not Released / MVP Done (see AdmissionEpicFacts). */
  lastUnreleasedSeen: ReadonlyMap<string, string> = new Map(),
): ImportAdmissionPlan {
  const denied = new Map<string, DeniedEpicInFile>();
  for (const [key, entry] of list) {
    if (!entry.allowImport) denied.set(key, { epicKey: key, origin: 'LIST', row: null, violations: [] });
  }

  for (const row of rows) {
    if (getIssueHierarchyLevel(row.issueType) !== 1) continue;
    const key = normalizeEpicKey(row.issueKey);
    const listed = denied.get(key);
    if (listed) {
      listed.row = row;
      continue;
    }
    if (list.get(key)?.allowImport) continue;
    const violations = evaluateImportAdmission(admissionFactsOfRow(row, toIsoDate, lastUnreleasedSeen.get(key) ?? null), settings);
    if (violations.length > 0) denied.set(key, { epicKey: key, origin: 'RULE', row, violations });
  }

  // Stories of a denied Epic, by key and by numeric Jira id, for the Subtasks that only point at them.
  const deniedParents = new Set<string>();
  const epicOf = (row: RawJiraIssue): string => normalizeEpicKey(row.epicLink ?? '');
  for (const row of rows) {
    if (getIssueHierarchyLevel(row.issueType) === 2 && denied.has(epicOf(row))) {
      deniedParents.add(normalizeEpicKey(row.issueKey));
      if (row.issueId) deniedParents.add(row.issueId.trim());
    }
  }

  const admitted: RawJiraIssue[] = [];
  const seenDenied = new Set<string>();
  let deniedRowCount = 0;
  for (const row of rows) {
    const level = getIssueHierarchyLevel(row.issueType);
    const ownerEpic = level === 1 ? normalizeEpicKey(row.issueKey) : epicOf(row);
    const parent = row.parentId ? row.parentId.trim() : '';
    const isDenied = denied.has(ownerEpic)
      || (level === 3 && parent !== '' && (deniedParents.has(parent) || deniedParents.has(normalizeEpicKey(parent))));
    if (!isDenied) {
      admitted.push(row);
      continue;
    }
    deniedRowCount += 1;
    // A Subtask dropped only through its Story still names its Epic for the report when it can.
    const epicKey = denied.has(ownerEpic) ? ownerEpic : null;
    if (epicKey) seenDenied.add(epicKey);
  }

  return {
    admitted,
    deniedEpics: [...denied.values()].filter((epic) => epic.row !== null || seenDenied.has(epic.epicKey)),
    deniedRowCount,
  };
}
