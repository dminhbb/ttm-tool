import { toIsoDate } from './dates';
import type { IsoDate, TtmAppliedKind } from './types';

/**
 * The crawl's "TTM-applied" and "except-TTM-plan" Epic fields (owner 2026-10-26). Pure — shared by the Scoring Service
 * (facts), the importer (black list) and the screens.
 */

/** Longest plausible stretch between Start Date and "except-TTM-plan" (calendar days) — also bounds the work-day count. */
export const MAX_EXCEPT_PLAN_SPAN_DAYS = 1100;

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

/**
 * 'Ngoại lệ' → EXCEPTION (Target = Kế hoạch ngoại lệ TTM); 'Không áp dụng' → NOT_APPLICABLE (Epic goes to the black
 * list at import); anything else — blank, None, 'Theo quy định', a misspelling — → STANDARD (the general rule).
 * Accent / case / spacing insensitive.
 */
export function normalizeTtmApplied(value: string | null | undefined): TtmAppliedKind {
  const text = fold(value ?? '');
  if (text === 'ngoai le') return 'EXCEPTION';
  if (text === 'khong ap dung') return 'NOT_APPLICABLE';
  return 'STANDARD';
}

/** "except-TTM-plan" → ISO date: dd-MM-yyyy (the crawl's format), dd/MM/yyyy or yyyy-MM-dd; null when blank, None or not a real date. */
export function parseExceptPlanDate(value: string | null | undefined): IsoDate | null {
  const text = (value ?? '').trim();
  if (!text || text.toLowerCase() === 'none') return null;
  let year: number;
  let month: number;
  let day: number;
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    const iso = toIsoDate(text);
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(text)) return null;
    [year, month, day] = iso.split('-').map(Number);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days between two ISO dates (calendar). */
export function calendarDaysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type ExceptPlanProblem = 'MISSING' | 'UNREADABLE' | 'BEFORE_START' | 'TOO_FAR';

/** Why the plan can't be the Target of an Epic that starts on `startDate` (null = usable, or Start Date unknown for the date checks). */
export function exceptPlanProblem(raw: string | null | undefined, startDate: IsoDate | null): ExceptPlanProblem | null {
  const text = (raw ?? '').trim();
  if (!text || text.toLowerCase() === 'none') return 'MISSING';
  const plan = parseExceptPlanDate(text);
  if (!plan) return 'UNREADABLE';
  if (!startDate) return null;
  if (plan < startDate) return 'BEFORE_START';
  if (calendarDaysBetween(startDate, plan) > MAX_EXCEPT_PLAN_SPAN_DAYS) return 'TOO_FAR';
  return null;
}
