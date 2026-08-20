/** 'login' is recorded server-side only (authenticateLocal); 'feature'/'data' are posted by the client via /api/usage-stats/track. */
export type UsageStatKind = 'login' | 'feature' | 'data';

export interface UsageStatsTotals {
  dataCount: number;
  featureCount: number;
  loginCount: number;
}
