import { getActiveHolidaySet } from '@/lib/master-data-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import { evaluateIssueCompliance } from '@/lib/epic-compliance-engine';
import type { ComplianceEvaluationResponse, ComplianceIssueInput } from '@/lib/epic-compliance-types';

export async function evaluateComplianceRequest(items: ComplianceIssueInput[], evaluatedAt: Date): Promise<ComplianceEvaluationResponse> {
  const [holidays, statusAlertRules, ttmPolicies] = await Promise.all([getActiveHolidaySet(), listActiveStatusAlertRules(), listTtmPolicies(true)]);
  return {
    evaluatedAt: evaluatedAt.toISOString().slice(0, 10),
    items: items.map((item) => evaluateIssueCompliance(item, evaluatedAt, holidays, statusAlertRules, ttmPolicies)),
  };
}
