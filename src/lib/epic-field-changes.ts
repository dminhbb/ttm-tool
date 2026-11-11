/**
 * "Epic thay đổi dữ liệu" (owner 2026-11-11) — shapes and wording shared by the server (epic-field-change-service.ts) and
 * the screen "Chuẩn hoá dữ liệu". Pure, no database import.
 */

export type EpicFieldChangeField = 'START_DATE' | 'R4G_DATE' | 'REQUIREMENT_LEVEL' | 'REQUEST_TYPE';

export interface EpicFieldChange {
  field: EpicFieldChangeField;
  /** aggregated_at of the version that carries the new value — its data layer. */
  layerAt: string;
  oldValue: string;
  /** null = the field was emptied. */
  newValue: string | null;
}

export const EPIC_FIELD_CHANGE_LABEL: Record<EpicFieldChangeField, string> = {
  START_DATE: 'Start date',
  R4G_DATE: 'R4G Date',
  REQUIREMENT_LEVEL: 'Requirement Level',
  REQUEST_TYPE: 'Loại yêu cầu',
};

/** The section's field filter — exactly one field at a time (owner 2026-11-11), "Thay đổi Start date" by default. */
export const EPIC_FIELD_CHANGE_FIELDS: readonly EpicFieldChangeField[] = ['START_DATE', 'R4G_DATE', 'REQUIREMENT_LEVEL', 'REQUEST_TYPE'];
export const EPIC_FIELD_CHANGE_DEFAULT_FIELD: EpicFieldChangeField = 'START_DATE';

/** A known field code, else the default (Start date). */
export function parseEpicFieldChangeField(raw: string | null | undefined): EpicFieldChangeField {
  return (EPIC_FIELD_CHANGE_FIELDS as readonly string[]).includes(raw ?? '') ? (raw as EpicFieldChangeField) : EPIC_FIELD_CHANGE_DEFAULT_FIELD;
}

/** Default of the section's "created date" calendar: 01/02/2026 (owner 2026-11-11). */
export const EPIC_FIELD_CHANGE_DEFAULT_FROM = '2026-02-01';

const DATE_FIELDS = new Set<EpicFieldChangeField>(['START_DATE', 'R4G_DATE']);

function viDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

/** "Start date: 01/02/2026 → 15/03/2026" — one line of the "Nhận xét" column (its data layer goes to the line's tooltip,
 * epicFieldChangeLayerNote — owner 2026-11-11). */
export function describeEpicFieldChange(change: EpicFieldChange): string {
  const show = (value: string | null) => (value === null ? '(trống)' : DATE_FIELDS.has(change.field) ? viDate(value) : value);
  return `${EPIC_FIELD_CHANGE_LABEL[change.field]}: ${show(change.oldValue)} → ${show(change.newValue)}`;
}

/** "Lớp dữ liệu 12/03/2026" — tooltip of a "Nhận xét" line: the data layer (import date) that showed the change. */
export function epicFieldChangeLayerNote(change: EpicFieldChange): string {
  return `Lớp dữ liệu ${viDate(change.layerAt)}`;
}

/** A YYYY-MM-DD date, else the default. */
export function parseEpicFieldChangeFrom(raw: string | null | undefined): string {
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ? raw : EPIC_FIELD_CHANGE_DEFAULT_FROM;
}
