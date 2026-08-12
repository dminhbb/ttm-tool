import type { EpicComplexity } from '@/lib/ttm-rules';

export const TTM_TYPES = ['TTM_CNTT', 'TTM_E2E'] as const;
export type TtmType = (typeof TTM_TYPES)[number];

export interface TtmPolicy {
  createdAt: string;
  epicComplexityType: EpicComplexity;
  fromTtmField: string;
  id: number;
  isActive: boolean;
  toTtmField: string;
  ttmType: TtmType;
  updatedAt: string;
  workingDays: number;
}

export type TtmPolicyInput = Pick<TtmPolicy, 'epicComplexityType' | 'fromTtmField' | 'isActive' | 'toTtmField' | 'ttmType' | 'workingDays'>;
