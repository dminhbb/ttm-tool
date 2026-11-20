import 'server-only';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { calculateTtm, type TtmCalculatorInput, type TtmCalculatorResult } from '@/lib/ttm-calculator';

/** Kết quả tính toán TTM kèm danh sách ngày nghỉ / ngày làm bù để client vẽ timeline tô xám ngày Lễ. */
export interface TtmCalculatorResponse {
  result: TtmCalculatorResult;
  /** Các ngày nghỉ theo cấu hình (`YYYY-MM-DD`, đã sắp xếp) — tô xám + ký tự '-' trên timeline. */
  holidays: string[];
  /** Các ngày làm bù (`YYYY-MM-DD`) — hiển thị như ngày làm việc bình thường. */
  workdays: string[];
}

/** Loads the live configuration (Rule Groups, Bộ ngân sách, holidays) and computes the imaginary Epic's milestones. */
export async function runTtmCalculator(input: TtmCalculatorInput): Promise<TtmCalculatorResponse> {
  const ctx = await loadScoringContext(vnToday());
  return {
    result: calculateTtm(input, ctx),
    holidays: [...ctx.holidays.holidays].sort(),
    workdays: [...ctx.holidays.workdays].sort(),
  };
}
