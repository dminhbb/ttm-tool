/**
 * "Float message" (Quản trị hệ thống, SUPERADMIN — owner 2026-11-17): a rounded floating box with a message icon and a
 * custom text, shown to every signed-in user — spec docs/superpowers/specs/2026-11-17-float-message-design.md. Pure module
 * (no database): the settings shape, the validation of a save, and whether the message shows on a given day. Table:
 * float_message_settings (migration 20261129).
 */

/** One line of text (owner 2026-11-17: a textbox of at most 256 characters). */
export const FLOAT_MESSAGE_MAX_LENGTH = 256;
export const FLOAT_MESSAGE_MAX_SECONDS = 3600;
export const FLOAT_MESSAGE_POSITIONS = ['TOP_RIGHT', 'BOTTOM_RIGHT'] as const;
export type FloatMessagePosition = (typeof FLOAT_MESSAGE_POSITIONS)[number];

export const FLOAT_MESSAGE_POSITION_LABELS: Record<FloatMessagePosition, string> = {
  BOTTOM_RIGHT: 'Góc phải phía dưới',
  TOP_RIGHT: 'Góc phải phía trên',
};

/** What a SUPERADMIN edits. Dates are "YYYY-MM-DD" (Vietnam time, both inclusive); null = no bound on that side. */
export interface FloatMessageInput {
  /** null = always shown (until closed, when it can be closed). */
  autoHideSeconds: number | null;
  dismissible: boolean;
  endDate: string | null;
  isActive: boolean;
  messageText: string;
  position: FloatMessagePosition;
  startDate: string | null;
}

export interface FloatMessageSettings extends FloatMessageInput {
  updatedAt: string | null;
  updatedByName: string | null;
}

/** What a signed-in user receives — only when the message is to be shown today. */
export interface PublicFloatMessage {
  autoHideSeconds: number | null;
  dismissible: boolean;
  position: FloatMessagePosition;
  text: string;
  /** updated_at of the last save — identifies the message (a closed message reappears on the next page load anyway). */
  version: string;
}

export const DEFAULT_FLOAT_MESSAGE: FloatMessageSettings = {
  autoHideSeconds: null,
  dismissible: true,
  endDate: null,
  isActive: false,
  messageText: '',
  position: 'BOTTOM_RIGHT',
  startDate: null,
  updatedAt: null,
  updatedByName: null,
};

export class FloatMessageInputError extends Error {}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateOrNull(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !isRealDate(value)) throw new FloatMessageInputError(`${label} không hợp lệ.`);
  return value;
}

/** Trims the text (one line: pasted line breaks become a space) and checks every field; throws FloatMessageInputError. */
export function validateFloatMessageInput(raw: unknown): FloatMessageInput {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (typeof record.messageText !== 'string') throw new FloatMessageInputError('Thiếu nội dung message.');
  const messageText = record.messageText.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (messageText.length > FLOAT_MESSAGE_MAX_LENGTH) throw new FloatMessageInputError(`Nội dung tối đa ${FLOAT_MESSAGE_MAX_LENGTH} ký tự.`);
  if (typeof record.isActive !== 'boolean' || typeof record.dismissible !== 'boolean') throw new FloatMessageInputError('Dữ liệu cấu hình không hợp lệ.');
  if (record.isActive && !messageText) throw new FloatMessageInputError('Nhập nội dung trước khi bật Float message.');
  if (!FLOAT_MESSAGE_POSITIONS.includes(record.position as FloatMessagePosition)) throw new FloatMessageInputError('Vị trí không hợp lệ.');
  let autoHideSeconds: number | null = null;
  if (record.autoHideSeconds !== null && record.autoHideSeconds !== undefined) {
    const seconds = record.autoHideSeconds;
    if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > FLOAT_MESSAGE_MAX_SECONDS) {
      throw new FloatMessageInputError(`Số giây tự tắt phải là số nguyên từ 1 đến ${FLOAT_MESSAGE_MAX_SECONDS}.`);
    }
    autoHideSeconds = seconds;
  }
  const startDate = dateOrNull(record.startDate, 'Ngày bắt đầu');
  const endDate = dateOrNull(record.endDate, 'Ngày kết thúc');
  if (startDate && endDate && startDate > endDate) throw new FloatMessageInputError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return {
    autoHideSeconds,
    dismissible: record.dismissible,
    endDate,
    isActive: record.isActive,
    messageText,
    position: record.position as FloatMessagePosition,
    startDate,
  };
}

/** Shown on `today` ("YYYY-MM-DD", Vietnam time): switched on, has text, and today lies in [startDate, endDate]. */
export function isFloatMessageShownOn(settings: Pick<FloatMessageInput, 'endDate' | 'isActive' | 'messageText' | 'startDate'>, today: string): boolean {
  if (!settings.isActive || !settings.messageText.trim()) return false;
  if (settings.startDate && today < settings.startDate) return false;
  if (settings.endDate && today > settings.endDate) return false;
  return true;
}

/** The public view of the settings for `today`, or null when nothing is to be shown. */
export function publicFloatMessageOf(settings: FloatMessageSettings, today: string): PublicFloatMessage | null {
  if (!isFloatMessageShownOn(settings, today)) return null;
  return {
    autoHideSeconds: settings.autoHideSeconds,
    dismissible: settings.dismissible,
    position: settings.position,
    text: settings.messageText,
    version: settings.updatedAt ?? 'initial',
  };
}
