import { CALCULATOR_LEVELS, CALCULATOR_REQUEST_TYPES, isRealDate } from '@/lib/ttm-calculator-text';
import type { TtmCalculatorInput } from '@/lib/ttm-calculator';

/**
 * Kiểm tra body của `POST /api/ttm-calculator` và `POST /api/epic-ttm-calendar` (dùng chung). Pure: không DB, không clock.
 * Trả `{ error }` (thông báo tiếng Việt, HTTP 400) hoặc `{ value }` đã hợp lệ.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIsoDate(value: unknown): value is string {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  return Boolean(match && isRealDate(Number(match[1]), Number(match[2]), Number(match[3])));
}

/** Ngày tuỳ chọn: bỏ trống → null; có giá trị mà sai định dạng / không tồn tại → ok:false. */
function optionalDate(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  return validIsoDate(value) ? { ok: true, value } : { ok: false };
}

export function parseCalculatorRequest(body: Record<string, unknown> | null): { error: string } | { value: TtmCalculatorInput } {
  const requestType = body?.requestType;
  const level = body?.requirementLevel;
  const createdDate = optionalDate(body?.createdDate);
  const ideaApprovedDate = optionalDate(body?.ideaApprovedDate);
  if (typeof requestType !== 'string' || !(CALCULATOR_REQUEST_TYPES as readonly string[]).includes(requestType)) return { error: 'Loại yêu cầu không hợp lệ.' };
  if (typeof level !== 'string' || !(CALCULATOR_LEVELS as readonly string[]).includes(level)) return { error: 'Requirement level phải là 1, 2, 3 hoặc 4.' };
  if (!validIsoDate(body?.startDate)) return { error: 'Start date không hợp lệ.' };
  if (!createdDate.ok || !ideaApprovedDate.ok) return { error: 'Created date / Ngày duyệt ý tưởng không hợp lệ.' };
  return { value: { createdDate: createdDate.value, ideaApprovedDate: ideaApprovedDate.value, requestType, requirementLevel: level, startDate: body.startDate as string } };
}
