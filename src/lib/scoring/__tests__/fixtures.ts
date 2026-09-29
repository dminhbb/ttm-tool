import { DEFAULT_SCORING_PARAMETERS } from '../parameters';
import type { EpicFacts, ScoringContext, ScoringTtmPolicy } from '../types';

export const POLICIES: ScoringTtmPolicy[] = [
  { epicComplexityType: 'CT-Lv12', fromTtmField: 'START_DATE', isActive: true, toTtmField: 'R4G_DATE', ttmType: 'TTM_CNTT', workingDays: 15 },
  { epicComplexityType: 'CT-Lv12', fromTtmField: 'IDEA_APPROVED_DATE', isActive: true, toTtmField: 'R4G_DATE', ttmType: 'TTM_E2E', workingDays: 20 },
  { epicComplexityType: 'SP-Lv12', fromTtmField: 'START_DATE', isActive: true, toTtmField: 'R4G_DATE', ttmType: 'TTM_CNTT', workingDays: 30 },
];

export function makeContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    asOf: '2026-09-01',
    holidays: { holidays: new Set(), workdays: new Set() },
    ttmPolicies: POLICIES,
    statusAlertRules: [
      { epicComplexityType: 'CT-Lv12', epicStatus: 'Design', lateAlertOffsetDays: 3 },
      { epicComplexityType: 'CT-Lv12', epicStatus: 'In Progress', lateAlertOffsetDays: 13 },
    ],
    scope: { cnttFrom: null, cnttTo: null, qaFrom: null, qaTo: null },
    parameters: DEFAULT_SCORING_PARAMETERS,
    ruleEnabled: {},
    rulesetVersion: 'test',
    ...overrides,
  };
}

/** Monday 2026-08-03 start; CT-Lv12 → Target_CNTT = +14 working days = Fri 2026-08-21. */
export function makeFacts(overrides: Partial<EpicFacts> = {}): EpicFacts {
  return {
    epicKey: 'TEST-1',
    status: 'DEV',
    complexity: 'CT-Lv12',
    ideaApprovedDate: '2026-07-27',
    jiraCreatedAt: '2026-07-20',
    startDate: '2026-08-03',
    r4gDate: null,
    dueDate: null,
    requestType: 'Tính năng mới',
    requirementLevel: '2',
    phaseCompletion: { designDone: true, devDone: false, testDone: false, r4goliveDone: false },
    ...overrides,
  };
}
