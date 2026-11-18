import 'server-only';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { calculateTtm, type TtmCalculatorInput, type TtmCalculatorResult } from '@/lib/ttm-calculator';

/** Loads the live configuration (Rule Groups, Bộ ngân sách, holidays) and computes the imaginary Epic's milestones. */
export async function runTtmCalculator(input: TtmCalculatorInput): Promise<TtmCalculatorResult> {
  const ctx = await loadScoringContext(vnToday());
  return calculateTtm(input, ctx);
}
