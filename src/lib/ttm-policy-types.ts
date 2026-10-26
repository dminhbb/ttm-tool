import type { EpicComplexity } from '@/lib/ttm-rules';

export const TTM_TYPES = ['TTM_CNTT', 'TTM_E2E'] as const;
export type TtmType = (typeof TTM_TYPES)[number];

/** The set every Epic was judged by before "Bộ ngân sách" existed; other sets only hold the rows that differ. */
export const DEFAULT_POLICY_SET_KEY = 'DEFAULT';

export interface TtmPolicySet {
  createdAt: string;
  key: string;
  name: string;
  note: string | null;
  /** Rule objects (src/lib/scoring/registry.ts) that read this set. */
  usedByRules: string[];
}

export interface TtmPolicy {
  createdAt: string;
  epicComplexityType: EpicComplexity;
  fromTtmField: string;
  id: number;
  isActive: boolean;
  policySet: string;
  toTtmField: string;
  ttmType: TtmType;
  updatedAt: string;
  workingDays: number;
}

export type TtmPolicyInput = Pick<TtmPolicy, 'epicComplexityType' | 'fromTtmField' | 'isActive' | 'policySet' | 'toTtmField' | 'ttmType' | 'workingDays'>;
