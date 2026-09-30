import { computeQaInScope, computeTtmCnttInScope } from '../../ttm-scope-rules';
import { PHASE_KEYS } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding } from '../types';

/** Axis SCOPE — "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo); bounds inclusive, see ttm-scope-rules.ts. */
export const scopeRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  if (!computeTtmCnttInScope(facts.r4gDate, derived.cnttTargetDate, ctx.scope)) {
    findings.push(finding('SCOPE_CNTT_OUT', `Ngoài phạm vi dữ liệu TTM-CNTT (QLDA) (${ctx.scope.cnttFrom ?? '…'} → ${ctx.scope.cnttTo ?? '…'}).`, { from: ctx.scope.cnttFrom, to: ctx.scope.cnttTo, comparedDate: facts.r4gDate ?? derived.cnttTargetDate }));
  }
  if (!computeQaInScope(facts.r4gDate, ctx.scope)) {
    findings.push(finding('SCOPE_QA_OUT', `Ngoài phạm vi dữ liệu QA (${ctx.scope.qaFrom ?? '…'} → ${ctx.scope.qaTo ?? '…'}).`, { from: ctx.scope.qaFrom, to: ctx.scope.qaTo, comparedDate: facts.r4gDate }));
  }
  return findings;
};

/**
 * Axis PHASE — every phase alerts off its own baseline, independent of Epic status; completion is
 * read AT asOf (decision D3). The one-day-before "Cảnh báo sớm" state was removed (D4).
 */
export const phaseRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  if (!derived.phases) {
    findings.push(finding('PHASE_NOT_COMPUTABLE', facts.startDate ? 'Không có ngân sách TTM-CNTT (QLDA) cho loại Epic này — không tính được baseline pha.' : 'Thiếu Start Date (T1) — không tính được baseline pha.'));
    return findings;
  }
  if (!facts.phaseCompletion) {
    findings.push(finding('PHASE_COMPLETION_UNAVAILABLE', `Không có dữ liệu story/subtask tại ${ctx.asOf} — không xác định được pha đã hoàn thành hay chưa.`));
  }
  for (const phase of PHASE_KEYS) {
    const cell = derived.phases[phase];
    const evidence = { baselineDate: cell.baselineDate };
    if (cell.isCurrent) findings.push(finding('PHASE_CURRENT', `Pha hiện tại: ${phase}.`, evidence, { subject: phase }));
    if (!facts.phaseCompletion) continue;
    if (cell.isDone) findings.push(finding('PHASE_DONE', `Pha ${phase} đã hoàn thành.`, evidence, { subject: phase }));
    else if (ctx.asOf > cell.baselineDate) findings.push(finding('PHASE_LATE', `Pha ${phase} chưa hoàn thành, đã quá baseline ${cell.baselineDate}.`, evidence, { subject: phase }));
  }
  return findings;
};
