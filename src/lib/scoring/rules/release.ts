import { normalizeWorkflowStatus } from '../derive';
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
  const status = normalizeWorkflowStatus(facts.status);

  // "Chờ golive" (redefined 2026-10-01) — Epic đã lên R4GOLIVE, hoặc đã Released mà quên ghi Due
  // Date. Không còn phụ thuộc R4G Date/hạn grace — tính độc lập với JUSTIFY_GOLIVE bên dưới (có thể
  // cùng active trên 1 Epic, 2 nhóm finding khác nhau: ALERT vs FAIL). Phạm vi "TTM-CNTT (QLDA)"
  // không gate ở đây mà qua SUPPRESSIONS (catalog.ts: SCOPE_CNTT_OUT → RELEASE_WAITING_GOLIVE).
  if (status === 'R4GOLIVE' || (status === 'RELEASED' && !facts.dueDate)) {
    findings.push(finding('RELEASE_WAITING_GOLIVE', status === 'R4GOLIVE'
      ? 'Epic đã ở trạng thái R4GOLIVE — chờ hoàn tất thủ tục golive.'
      : 'Epic đã Released nhưng chưa ghi nhận Due Date — chờ hoàn tất thủ tục golive.', { status }));
  }

  const grace = derived.releaseGraceDeadline;
  if (!facts.r4gDate || !grace) return findings;
  const evidence = { graceDeadline: grace, graceWorkingDays: ctx.parameters['release.graceWorkingDays'] };
  const released = status === 'RELEASED';

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
  }
  return findings;
};
