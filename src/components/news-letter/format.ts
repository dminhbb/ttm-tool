/** Dates of "Bản tin" — the API sends PostgreSQL timestamptz text ("2026-11-06 10:43:35.05+00"). */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (part: number) => String(part).padStart(2, '0');

/** "06/11/2026" */
export function formatNewsDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : '—';
}

/** "06/11/2026 17:43" */
export function formatNewsDateTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? `${formatNewsDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}` : '—';
}
