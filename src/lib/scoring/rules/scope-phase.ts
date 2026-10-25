import { computeQaInScope, computeTtmCnttInScope } from '../../ttm-scope-rules';
import { PHASE_KEYS } from '../derive';
import { finding } from './rule-types';
import type { ScoringRule } from './rule-types';
import type { Finding } from '../types';

/** Axis SCOPE — "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo); bounds inclusive, see ttm-scope-rules.ts. Always runs:
 * it decides whether an Epic is COUNTED, not how it is judged (spec 2026-10-25, D15). */
export const scopeRule: ScoringRule = {
  id: 'scope',
  name: 'Phạm vi dữ liệu cho TTM / Epic ngoại lệ',
  summary: 'Epic có nằm trong "Phạm vi dữ liệu cho TTM" (QLDA / QA) không, và có phải Epic ngoại lệ (Black listed / dự án Time to Market = N) không.',
  detail: { conditions: 'Luôn chạy, kể cả với Epic ngoại lệ (chỉ rule này chạy cho Epic ngoại lệ).', parameters: ['Cấu hình cảnh báo — Phạm vi dữ liệu cho TTM (R4G for TTM CNTT / QA)', 'Epic ngoại lệ', 'Quản lý Dự án — Time to Market'] },
  category: 'SCOPE',
  stage: 'PRIMARY',
  core: true,
  emits: ['SCOPE_TTM_BLACK_LISTED', 'SCOPE_PROJECT_NON_TTM', 'SCOPE_CNTT_OUT', 'SCOPE_QA_OUT'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts, derived, ctx }) => {
    const findings: Finding[] = [];
    // "Epic ngoại lệ" — taken out of the TTM calculation altogether (L02), see TtmExclusion. Off the
    // same fact score-epic.ts runs no other rule for the Epic and keeps it out of both indexes.
    if (facts.ttmExclusion === 'BLACK_LISTED') {
      findings.push(finding('SCOPE_TTM_BLACK_LISTED', 'Epic ngoại lệ (TTM Black listed) — Scoring Service không xét, nằm ngoài phạm vi tính toán Time to Market.'));
    } else if (facts.ttmExclusion === 'PROJECT_NON_TTM') {
      findings.push(finding('SCOPE_PROJECT_NON_TTM', 'Epic ngoại lệ (dự án có Time to Market = N) — Scoring Service không xét, nằm ngoài phạm vi tính toán Time to Market.'));
    }
    if (!computeTtmCnttInScope(facts.r4gDate, derived.cnttTargetDate, ctx.scope)) {
      findings.push(finding('SCOPE_CNTT_OUT', `Ngoài phạm vi dữ liệu TTM-CNTT (QLDA) (${ctx.scope.cnttFrom ?? '…'} → ${ctx.scope.cnttTo ?? '…'}).`, { from: ctx.scope.cnttFrom, to: ctx.scope.cnttTo, comparedDate: facts.r4gDate ?? derived.cnttTargetDate }));
    }
    if (!computeQaInScope(facts.r4gDate, ctx.scope)) {
      findings.push(finding('SCOPE_QA_OUT', `Ngoài phạm vi dữ liệu QA (${ctx.scope.qaFrom ?? '…'} → ${ctx.scope.qaTo ?? '…'}).`, { from: ctx.scope.qaFrom, to: ctx.scope.qaTo, comparedDate: facts.r4gDate }));
    }
    return findings;
  },
};

/**
 * Axis PHASE — every phase alerts off its own baseline, independent of Epic status; completion is
 * read AT asOf (decision D3). The one-day-before "Cảnh báo sớm" state was removed (D4). Always runs (owner decision
 * 2026-10-25); the baselines are % of the TTM-CNTT budget of the Epic's "Bộ ngân sách", so they follow it.
 */
export const phaseRule: ScoringRule = {
  id: 'phase',
  name: 'Pha — Trễ pha / Hoàn thành pha / Pha hiện tại',
  summary: 'Mỗi pha DESIGN / DEV / TEST / PENTEST / R4GOLIVE có baseline theo % ngân sách TTM-CNTT; pha chưa xong mà đã qua baseline là Trễ pha.',
  detail: { conditions: 'Luôn chạy. Cần Start Date và ngân sách TTM-CNTT; hoàn thành pha đọc theo story/subtask tại ngày đang xem. Kèm khuyến nghị "Đẩy nhanh pha" cho pha hiện tại đang trễ.', parameters: ['phase.percentages (mặc định 20 / 30 / 30 / 10 / 10 %)'] },
  category: 'PHASE',
  stage: 'PRIMARY',
  core: true,
  emits: ['PHASE_NOT_COMPUTABLE', 'PHASE_COMPLETION_UNAVAILABLE', 'PHASE_CURRENT', 'PHASE_DONE', 'PHASE_LATE', 'REC_ACCELERATE_PHASE'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts, derived, ctx }) => {
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
  },
  recommend: (_input, _active, findings) => {
    const currentPhase = findings.find((item) => item.badge === 'PHASE_CURRENT' && !item.suppressedBy)?.subject;
    if (!currentPhase || !findings.some((item) => item.badge === 'PHASE_LATE' && item.subject === currentPhase && !item.suppressedBy)) return [];
    return [finding('REC_ACCELERATE_PHASE', `Đẩy nhanh pha ${currentPhase} đang trễ baseline.`, {}, { relatedTo: ['PHASE_LATE'], subject: currentPhase })];
  },
};
