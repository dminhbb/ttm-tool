import 'server-only';
import { createHash } from 'node:crypto';
import pool from '@/lib/db';
import { getActiveHolidaySet } from '@/lib/master-data-service';
import { loadRuleGroups } from '@/lib/rule-group-service';
import { listActiveStatusAlertRules } from '@/lib/status-alert-rule-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import { getTtmScopeConfig } from '@/lib/ttm-scope-config-service';
import { resolveScoringParameters } from '@/lib/scoring/parameters';
import { SCORING_CODE_VERSION } from '@/lib/scoring/registry';
import type { ScoringContext, ScoringScopeConfig } from '@/lib/scoring/types';

/** Today's date in Vietnam ("YYYY-MM-DD") — the default asOf, independent of the server's time zone. */
export function vnToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function loadParameterOverrides(): Promise<Record<string, unknown>> {
  const result = await pool.query<{ key: string; value: unknown }>('SELECT param_key AS key, value FROM scoring_parameters;');
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
}

/**
 * Everything the pure scoring service needs besides the Epic itself, loaded from the same config
 * tables the legacy engine reads (holidays, TTM policies, status alert offsets, "Phạm vi dữ liệu cho
 * TTM") plus the scoring-only parameters and the Rule Groups (Rule Management). `scopeOverride` mirrors
 * EpicAlertFilters' deep-link override (undefined per field = admin default).
 */
export async function loadScoringContext(asOf: string, scopeOverride: Partial<ScoringScopeConfig> = {}): Promise<ScoringContext> {
  const [holidays, statusAlertRules, ttmPolicies, scopeDefault, parameterOverrides, ruleGroups] = await Promise.all([
    getActiveHolidaySet(),
    listActiveStatusAlertRules(),
    listTtmPolicies(true),
    getTtmScopeConfig(),
    loadParameterOverrides(),
    loadRuleGroups(),
  ]);
  const scope: ScoringScopeConfig = {
    cnttFrom: scopeOverride.cnttFrom !== undefined ? scopeOverride.cnttFrom : scopeDefault.cnttFrom,
    cnttTo: scopeOverride.cnttTo !== undefined ? scopeOverride.cnttTo : scopeDefault.cnttTo,
    qaFrom: scopeOverride.qaFrom !== undefined ? scopeOverride.qaFrom : scopeDefault.qaFrom,
    qaTo: scopeOverride.qaTo !== undefined ? scopeOverride.qaTo : scopeDefault.qaTo,
  };
  const parameters = resolveScoringParameters(parameterOverrides);
  const fingerprint = JSON.stringify({
    parameters,
    // ttmApplied too (2026-10-26): a group's TTM-applied condition changes which Epics it judges.
    ruleGroups: ruleGroups.map((group) => [group.id, group.name, group.priority, group.isDefault, group.enabled, group.conditions, group.ttmApplied ?? null, [...group.ruleIds].sort(), [...(group.offRuleIds ?? [])].sort()]),
    scope,
    statusAlertRules: statusAlertRules.map((rule) => [rule.epicComplexityType, rule.epicStatus, rule.lateAlertPercent]).sort(),
    ttmPolicies: ttmPolicies.map((policy) => [policy.policySet, policy.ttmType, policy.epicComplexityType, policy.fromTtmField, policy.toTtmField, policy.workingDays]).sort(),
    holidays: [...holidays.holidays].sort(),
    workdays: [...holidays.workdays].sort(),
  });
  const rulesetVersion = `${SCORING_CODE_VERSION}:${createHash('sha1').update(fingerprint).digest('hex').slice(0, 12)}`;

  return { asOf, holidays, statusAlertRules, ttmPolicies, scope, parameters, ruleGroups, rulesetVersion };
}
