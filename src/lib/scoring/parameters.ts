import type { TtmPhaseKey } from './types';

/**
 * Tunable rule parameters. Defaults live here (= today's behavior); an admin override is stored per
 * key in scoring_parameters (value JSONB) and merged over these by resolveScoringParameters.
 */
export interface ScoringParameters {
  /** Release axis grace (and R7 "Sai Status (Release)"): Due Date must land within R4G + N working days. */
  'release.graceWorkingDays': number;
  /** "Pending lâu": Pending for ≥ ratio × TTM-CNTT budget. */
  'anomaly.pendingStaleRatio': number;
  /** Statuses exempt from every data-quality rule (and R7). Compared upper-cased, workflow-normalized. */
  'anomaly.exemptStatuses': string[];
  /** Requirement Levels that contradict an SP-type complexity. */
  'anomaly.spMismatchLevels': string[];
  /** Share of the TTM-CNTT budget per phase, walked in order DESIGN → R4GOLIVE. */
  'phase.percentages': Record<TtmPhaseKey, number>;
  /** Statuses counted by QA-Index (upper-cased). */
  'index.qaStatuses': string[];
}

export const DEFAULT_SCORING_PARAMETERS: ScoringParameters = {
  'release.graceWorkingDays': 5,
  'anomaly.pendingStaleRatio': 0.2,
  'anomaly.exemptStatuses': ['TO DO', 'IN PO', 'BACKLOG'],
  'anomaly.spMismatchLevels': ['1', '2'],
  'phase.percentages': { DESIGN: 0.2, DEV: 0.3, TEST: 0.3, PENTEST: 0.1, R4GOLIVE: 0.1 },
  'index.qaStatuses': ['MVP DONE', 'RELEASED'],
};

export type ScoringParameterKey = keyof ScoringParameters;

export const SCORING_PARAMETER_LABELS: Record<ScoringParameterKey, string> = {
  'release.graceWorkingDays': 'Thời hạn grace trục Release (ngày làm việc)',
  'anomaly.pendingStaleRatio': 'Ngưỡng "Pending lâu" (tỉ lệ ngân sách TTM-CNTT (QLDA))',
  'anomaly.exemptStatuses': 'Status được miễn rule chất lượng dữ liệu (ngoài Cancelled)',
  'anomaly.spMismatchLevels': 'Requirement Level mâu thuẫn với loại SP',
  'phase.percentages': 'Tỉ lệ ngân sách từng pha',
  'index.qaStatuses': 'Status tính vào TTM-CNTT (QA)',
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

const VALIDATORS: { [K in ScoringParameterKey]: (value: unknown) => value is ScoringParameters[K] } = {
  'release.graceWorkingDays': (value): value is number => Number.isInteger(value) && (value as number) >= 0,
  'anomaly.pendingStaleRatio': (value): value is number => typeof value === 'number' && value > 0 && value <= 1,
  'anomaly.exemptStatuses': isStringArray,
  'anomaly.spMismatchLevels': isStringArray,
  'phase.percentages': (value): value is Record<TtmPhaseKey, number> => {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (['DESIGN', 'DEV', 'TEST', 'PENTEST', 'R4GOLIVE'] as const).every((key) => typeof record[key] === 'number' && (record[key] as number) >= 0);
  },
  'index.qaStatuses': isStringArray,
};

export function isValidScoringParameter<K extends ScoringParameterKey>(key: K, value: unknown): value is ScoringParameters[K] {
  return VALIDATORS[key](value);
}

/** Merges stored overrides over the defaults, silently ignoring unknown keys and invalid values
 * (a bad row must never break scoring). */
export function resolveScoringParameters(overrides: Record<string, unknown>): ScoringParameters {
  const result: ScoringParameters = { ...DEFAULT_SCORING_PARAMETERS };
  for (const key of Object.keys(DEFAULT_SCORING_PARAMETERS) as ScoringParameterKey[]) {
    const value = overrides[key];
    if (value !== undefined && isValidScoringParameter(key, value)) {
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
