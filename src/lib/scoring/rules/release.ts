import { normalizeWorkflowStatus, STATUS_INDEX } from '../derive';
import { finding } from './rule-types';
import type { PrimaryRule } from './rule-types';
import type { Finding } from '../types';
import { isExemptFromDataQuality } from './data-quality';

/**
 * Axis RELEASE — Due Date / Released discipline against R4G Date + grace (G working days).
 * "Cảnh báo sớm" (status past R4GOLIVE, still inside grace, no Due Date) was removed 2026-09-29:
 * that case now shows no Release badge until it becomes "Giải trình Golive".
 * "Sai Status" here is the former data-quality rule R7 (moved 2026-09-29, no longer an anomaly).
 */
export const releaseRule: PrimaryRule = ({ facts, derived, ctx }) => {
  const findings: Finding[] = [];
  const grace = derived.releaseGraceDeadline;
  if (!facts.r4gDate || !grace) return findings;
  const evidence = { graceDeadline: grace, graceWorkingDays: ctx.parameters['release.graceWorkingDays'] };
  const released = normalizeWorkflowStatus(facts.status) === 'RELEASED';

  // Former R7 — shares the data-quality exemption list (Cancelled/To Do/In PO/Backlog).
  if (facts.dueDate && facts.dueDate <= grace && !released && !isExemptFromDataQuality(facts.status, ctx)) {
    findings.push(finding('RELEASE_STATUS_MISMATCH', `Due Date ${facts.dueDate} đúng hạn (≤ ${grace}) nhưng status Epic chưa chuyển sang Released — vui lòng cập nhật status.`, evidence));
  }
  if (derived.isCancelled) return findings;
  if (facts.dueDate && facts.dueDate <= grace && released) {
    findings.push(finding('RELEASE_ON_TIME', `Released với Due Date ${facts.dueDate} trong hạn ${grace}.`, evidence));
  }
  if (facts.dueDate) {
    if (facts.dueDate > grace) findings.push(finding('RELEASE_JUSTIFY_GOLIVE', `Due Date ${facts.dueDate} vượt hạn ${grace} (R4G Date + ${evidence.graceWorkingDays} ngày làm việc) — cần giải trình.`, evidence));
    return findings;
  }
  if (ctx.asOf > grace) {
    findings.push(finding('RELEASE_JUSTIFY_GOLIVE', `Đã quá hạn ${grace} mà chưa có Due Date — cần giải trình.`, evidence));
  } else if (derived.statusIndex <= STATUS_INDEX.R4GOLIVE) {
    findings.push(finding('RELEASE_WAITING_GOLIVE', `Đã R4G, còn trong hạn ${grace}, chưa có Due Date.`, evidence));
  }
  return findings;
};
