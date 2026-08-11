import { getActiveHolidaySet } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import type { ComplianceEvaluationResponse, ComplianceIssueInput } from '@/lib/epic-compliance-types';

export async function evaluateComplianceRequest(items: ComplianceIssueInput[], evaluatedAt: Date): Promise<ComplianceEvaluationResponse> {
  const [holidays, statusAlertRules] = await Promise.all([getActiveHolidaySet(), listActiveStatusAlertRules()]);
  return {
    evaluatedAt: evaluatedAt.toISOString().slice(0, 10),
    items: items.map((item) => evaluateIssueCompliance(item, evaluatedAt, holidays, statusAlertRules)),
  };
}
