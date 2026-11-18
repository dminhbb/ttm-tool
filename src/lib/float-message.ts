/**
 * "Float message" (Quản trị hệ thống, SUPERADMIN — owner 2026-11-17): a rounded floating box with a message icon and a
 * custom text, shown to every signed-in user — spec docs/superpowers/specs/2026-11-17-float-message-design.md. Pure module
 * (no database): the settings shape, the validation of a save, and whether the message shows on a given day. Table:
 * float_message_settings (migration 20261129).
 */

/** One line of text (owner 2026-11-17: a textbox of at most 256 characters). */
export const FLOAT_MESSAGE_MAX_LENGTH = 256;
export const FLOAT_MESSAGE_MAX_SECONDS = 3600;
export const FLOAT_MESSAGE_MAX_URL_LENGTH = 2048;

/** Mã float message do ứng dụng tự sinh (REQ-20261118-04): mỗi nguồn trong hàng đợi có một mã cố định. */
export const FLOAT_MESSAGE_CODES = {
  ASSIGNED_TASKS: 'FM-002',
  CACHE: 'FM-001',
  SYSTEM_CONFIG: 'FM-003',
} as const;
export type FloatMessageCode = (typeof FLOAT_MESSAGE_CODES)[keyof typeof FLOAT_MESSAGE_CODES];
/** Thứ tự ưu tiên 1 ký tự: 1 = ưu tiên nhất. Message cấu hình ở Quản trị hệ thống luôn ở mức cuối (9), không sửa được. */
export const FLOAT_MESSAGE_MIN_RANK = 1;
export const FLOAT_MESSAGE_MAX_EDITABLE_RANK = 8;
export const FLOAT_MESSAGE_SYSTEM_CONFIG_RANK = 9;
/** Hai nguồn hệ thống có thể đổi thứ tự ưu tiên (code → mặc định). */
export const FLOAT_MESSAGE_EDITABLE_CODES = [FLOAT_MESSAGE_CODES.CACHE, FLOAT_MESSAGE_CODES.ASSIGNED_TASKS] as const;
export type EditableFloatMessageCode = (typeof FLOAT_MESSAGE_EDITABLE_CODES)[number];
export type FloatMessagePriorities = Record<EditableFloatMessageCode, number>;
export const DEFAULT_FLOAT_MESSAGE_PRIORITIES: FloatMessagePriorities = { 'FM-001': 1, 'FM-002': 2 };
export const FLOAT_MESSAGE_POSITIONS = ['TOP_RIGHT', 'BOTTOM_RIGHT'] as const;
export type FloatMessagePosition = (typeof FLOAT_MESSAGE_POSITIONS)[number];

/** Dispatched in the browser tab when SUPERADMIN saves Float message settings so FloatMessageDisplay refreshes at once. */
export const FLOAT_MESSAGE_CHANGED_EVENT = 'ttm:float-message-changed';

export function notifyFloatMessageChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FLOAT_MESSAGE_CHANGED_EVENT));
}

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
  /** Viền nổi bật màu nâu (giống thông báo My assigned tasks); mặc định tắt. */
  highlightBorder: boolean;
  isActive: boolean;
  messageText: string;
  /** true = mở URL ở tab mới; false (mặc định) = mở ở tab hiện tại. Chỉ có nghĩa khi có `url`. */
  openInNewTab: boolean;
  position: FloatMessagePosition;
  startDate: string | null;
  /** URL mở khi bấm vào message (http/https hoặc đường dẫn nội bộ bắt đầu bằng "/"); null = không bấm được. */
  url: string | null;
}

export interface FloatMessageSettings extends FloatMessageInput {
  updatedAt: string | null;
  updatedByName: string | null;
}

/** What a signed-in user receives — only when the message is to be shown today. */
export interface PublicFloatMessage {
  autoHideSeconds: number | null;
  dismissible: boolean;
  highlightBorder: boolean;
  openInNewTab: boolean;
  position: FloatMessagePosition;
  text: string;
  url: string | null;
  /** updated_at of the last save — identifies the message (a closed message reappears on the next page load anyway). */
  version: string;
}

export const DEFAULT_FLOAT_MESSAGE: FloatMessageSettings = {
  autoHideSeconds: null,
  dismissible: true,
  endDate: null,
  highlightBorder: false,
  isActive: false,
  messageText: '',
  openInNewTab: false,
  position: 'BOTTOM_RIGHT',
  startDate: null,
  url: null,
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

/**
 * "Dạng URL" (REQ-20261118-04): URL tuyệt đối http/https (có host) hoặc đường dẫn nội bộ bắt đầu bằng một dấu "/"
 * (ví dụ "/epic-alerts-15"). Từ chối `javascript:`, `data:`... Trả về URL đã trim, hoặc null nếu không hợp lệ.
 * Dùng chung cho client (form) và server (API).
 */
export function normalizeFloatMessageUrl(value: string): string | null {
  const url = value.trim();
  if (!url || url.length > FLOAT_MESSAGE_MAX_URL_LENGTH || /\s/.test(url)) return null;
  if (url.startsWith('/')) return url.startsWith('//') || url.includes('\\') ? null : url;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname ? url : null;
  } catch {
    return null;
  }
}

export function isInternalFloatMessageUrl(url: string): boolean {
  return url.startsWith('/');
}

/** Checks the editable priorities of the system messages (each an integer 1..8); throws FloatMessageInputError. */
export function validateFloatMessagePriorities(raw: unknown): FloatMessagePriorities {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_FLOAT_MESSAGE_PRIORITIES };
  for (const code of FLOAT_MESSAGE_EDITABLE_CODES) {
    const rank = record[code];
    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < FLOAT_MESSAGE_MIN_RANK || rank > FLOAT_MESSAGE_MAX_EDITABLE_RANK) {
      throw new FloatMessageInputError(`Thứ tự ưu tiên của ${code} phải là một chữ số từ ${FLOAT_MESSAGE_MIN_RANK} đến ${FLOAT_MESSAGE_MAX_EDITABLE_RANK}.`);
    }
    result[code] = rank;
  }
  return result;
}

export interface FloatMessageListRow {
  code: FloatMessageCode;
  /** Chỉ hai nguồn hệ thống sửa được; message cấu hình Quản trị hệ thống luôn ở mức cuối. */
  editable: boolean;
  priority: number;
  text: string;
}

export const CACHE_MESSAGE_TEXT = 'Thông báo Tạo cache (ví dụ "Hệ thống đang tính toán lại cache", "Tạo Cache hoàn thành")';
export const ASSIGNED_TASKS_MESSAGE_TEXT = 'Thông báo My assigned tasks ("TASK: Bạn có {n} epic được giao task!")';

/** The list under the form: ordered by priority, ties by code A-Z. */
export function buildFloatMessageList(messageText: string, priorities: FloatMessagePriorities): FloatMessageListRow[] {
  const rows: FloatMessageListRow[] = [
    { code: FLOAT_MESSAGE_CODES.CACHE, editable: true, priority: priorities['FM-001'], text: CACHE_MESSAGE_TEXT },
    { code: FLOAT_MESSAGE_CODES.ASSIGNED_TASKS, editable: true, priority: priorities['FM-002'], text: ASSIGNED_TASKS_MESSAGE_TEXT },
    { code: FLOAT_MESSAGE_CODES.SYSTEM_CONFIG, editable: false, priority: FLOAT_MESSAGE_SYSTEM_CONFIG_RANK, text: messageText.trim() || '(Chưa cấu hình nội dung)' },
  ];
  return rows.sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
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
  for (const key of ['openInNewTab', 'highlightBorder'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') throw new FloatMessageInputError('Dữ liệu cấu hình không hợp lệ.');
  }
  let url: string | null = null;
  if (record.url !== null && record.url !== undefined && record.url !== '') {
    if (typeof record.url !== 'string') throw new FloatMessageInputError('URL không hợp lệ.');
    url = record.url.trim() === '' ? null : normalizeFloatMessageUrl(record.url);
    if (record.url.trim() !== '' && !url) throw new FloatMessageInputError('URL không hợp lệ: nhập địa chỉ http(s)://... hoặc đường dẫn nội bộ bắt đầu bằng "/".');
  }
  const startDate = dateOrNull(record.startDate, 'Ngày bắt đầu');
  const endDate = dateOrNull(record.endDate, 'Ngày kết thúc');
  if (startDate && endDate && startDate > endDate) throw new FloatMessageInputError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  return {
    autoHideSeconds,
    dismissible: record.dismissible,
    endDate,
    highlightBorder: record.highlightBorder === true,
    isActive: record.isActive,
    messageText,
    openInNewTab: url ? record.openInNewTab === true : false,
    position: record.position as FloatMessagePosition,
    startDate,
    url,
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
    highlightBorder: settings.highlightBorder,
    openInNewTab: settings.openInNewTab,
    position: settings.position,
    text: settings.messageText,
    url: settings.url,
    version: settings.updatedAt ?? 'initial',
  };
}
