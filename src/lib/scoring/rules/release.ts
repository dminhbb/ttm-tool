import { normalizeWorkflowStatus } from '../derive';
import { finding } from './rule-types';
import type { RuleInput, ScoringRule } from './rule-types';
import type { Finding } from '../types';
import { isExemptFromDataQuality } from './data-quality';

/**
 * Axis RELEASE — Due Date / Released discipline against R4G Date + grace (G working days).
 * "Cảnh báo sớm" (status past R4GOLIVE, still inside grace, no Due Date) was removed 2026-09-29:
 * that case now shows no Release badge until it becomes "Giải trình Golive".
 * "Sai Status" here is the former data-quality rule R7 (moved 2026-09-29, no longer an anomaly).
 * One Rule object per badge since 2026-10-25: "Chờ golive" and "Giải trình Golive" are selectable, "Sai Status" and
 * "Release đúng hạn" always run (owner decision 2026-10-25).
 */

const GRACE_PARAMETER = 'release.graceWorkingDays (mặc định 5 ngày làm việc sau R4G Date)';

/** R4G Date + grace, when both exist — every rule here but "Chờ golive" needs them. */
function graceOf({ facts, derived, ctx }: RuleInput): { grace: string; evidence: Finding['evidence'] } | null {
  const grace = derived.releaseGraceDeadline;
  if (!facts.r4gDate || !grace) return null;
  return { grace, evidence: { graceDeadline: grace, graceWorkingDays: ctx.parameters['release.graceWorkingDays'] } };
}

function isReleased(status: string): boolean {
  return normalizeWorkflowStatus(status) === 'RELEASED';
}

/** "Chờ golive" (redefined 2026-10-01) — Epic đã lên R4GOLIVE, hoặc đã Released mà quên ghi Due Date. Không phụ thuộc
 * R4G Date/hạn grace — có thể cùng active với "Giải trình Golive". Phạm vi "TTM-CNTT (QLDA)" gate qua SUPPRESSIONS
 * (catalog.ts: SCOPE_CNTT_OUT → RELEASE_WAITING_GOLIVE). */
export const releaseWaitingGoliveRule: ScoringRule = {
  id: 'release-waiting-golive',
  name: 'Chờ golive',
  summary: 'Epic đã lên R4GOLIVE, hoặc đã Released mà chưa ghi Due Date — đang chờ hoàn tất thủ tục golive.',
  detail: { conditions: 'Chỉ tính trong "Phạm vi dữ liệu cho TTM" (QLDA). Không phụ thuộc R4G Date / hạn grace.', history: ['01/10/2026: định nghĩa lại theo status.'] },
  category: 'RELEASE',
  stage: 'PRIMARY',
  core: false,
  slot: 'RELEASE_WAITING_GOLIVE',
  emits: ['RELEASE_WAITING_GOLIVE'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: ({ facts }) => {
    const status = normalizeWorkflowStatus(facts.status);
    if (status !== 'R4GOLIVE' && !(status === 'RELEASED' && !facts.dueDate)) return [];
    return [finding('RELEASE_WAITING_GOLIVE', status === 'R4GOLIVE'
      ? 'Epic đã ở trạng thái R4GOLIVE — chờ hoàn tất thủ tục golive.'
      : 'Epic đã Released nhưng chưa ghi nhận Due Date — chờ hoàn tất thủ tục golive.', { status })];
  },
};

/** Former R7 — shares the data-quality exemption list (Cancelled/To Do/In PO/Backlog). */
export const releaseStatusMismatchRule: ScoringRule = {
  id: 'release-status-mismatch',
  name: 'Sai Status (Release)',
  summary: 'Due Date đúng hạn (≤ R4G Date + grace) nhưng status Epic chưa chuyển sang Released.',
  detail: { conditions: 'Luôn chạy. Miễn trừ: Cancelled và các status được miễn rule Chất lượng dữ liệu (mặc định To Do / In PO / Backlog).', parameters: [GRACE_PARAMETER] },
  category: 'RELEASE',
  stage: 'PRIMARY',
  core: true,
  emits: ['RELEASE_STATUS_MISMATCH'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: (input) => {
    const { facts, ctx } = input;
    const window = graceOf(input);
    if (!window || !facts.dueDate || facts.dueDate > window.grace || isReleased(facts.status) || isExemptFromDataQuality(facts.status, ctx)) return [];
    return [finding('RELEASE_STATUS_MISMATCH', `Due Date ${facts.dueDate} đúng hạn (≤ ${window.grace}) nhưng status Epic chưa chuyển sang Released — vui lòng cập nhật status.`, window.evidence)];
  },
};

/** "Release đúng hạn" — runs always, but its badge still ships disabled (owner decision 2026-10-25: chưa thực hiện). */
export const releaseOnTimeRule: ScoringRule = {
  id: 'release-on-time',
  name: 'Release đúng hạn',
  summary: 'Đã Released với Due Date trong hạn grace sau R4G Date. Badge hiện đang TẮT.',
  detail: { conditions: 'Luôn chạy, nhưng badge "Release đúng hạn" mặc định tắt (chưa đưa vào sử dụng). Không áp dụng Epic Cancelled.', parameters: [GRACE_PARAMETER] },
  category: 'RELEASE',
  stage: 'PRIMARY',
  core: true,
  emits: ['RELEASE_ON_TIME'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: (input) => {
    const { facts, derived } = input;
    const window = graceOf(input);
    if (!window || derived.isCancelled || !facts.dueDate || facts.dueDate > window.grace || !isReleased(facts.status)) return [];
    return [finding('RELEASE_ON_TIME', `Released với Due Date ${facts.dueDate} trong hạn ${window.grace}.`, window.evidence)];
  },
};

export const releaseJustifyGoliveRule: ScoringRule = {
  id: 'release-justify-golive',
  name: 'Giải trình Golive',
  summary: 'Golive vượt hạn grace sau R4G Date (Due Date muộn hơn R4G Date + grace, hoặc chưa có Due Date mà đã quá hạn) — cần giải trình.',
  detail: { conditions: 'Cần có R4G Date. Không áp dụng Epic Cancelled. Kèm khuyến nghị "Chuẩn bị giải trình".', parameters: [GRACE_PARAMETER] },
  category: 'RELEASE',
  stage: 'PRIMARY',
  core: false,
  slot: 'RELEASE_JUSTIFY_GOLIVE',
  emits: ['RELEASE_JUSTIFY_GOLIVE', 'REC_PREPARE_GOLIVE_JUSTIFICATION'],
  defaultSelected: true,
  lifecycle: 'active',
  gatedByDataAnomaly: false,
  evaluate: (input) => {
    const { facts, derived, ctx } = input;
    const window = graceOf(input);
    if (!window || derived.isCancelled) return [];
    const { grace, evidence } = window;
    if (facts.dueDate) {
      return facts.dueDate > grace
        ? [finding('RELEASE_JUSTIFY_GOLIVE', `Due Date ${facts.dueDate} vượt hạn ${grace} (R4G Date + ${evidence.graceWorkingDays} ngày làm việc) — cần giải trình.`, evidence)]
        : [];
    }
    return ctx.asOf > grace ? [finding('RELEASE_JUSTIFY_GOLIVE', `Đã quá hạn ${grace} mà chưa có Due Date — cần giải trình.`, evidence)] : [];
  },
  recommend: (_input, active) => (active.has('RELEASE_JUSTIFY_GOLIVE')
    ? [finding('REC_PREPARE_GOLIVE_JUSTIFICATION', 'Chuẩn bị nội dung giải trình Golive trễ hạn.', {}, { relatedTo: ['RELEASE_JUSTIFY_GOLIVE'] })]
    : []),
};
