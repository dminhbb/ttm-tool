import pool from '@/lib/db';
import { countEmptyExpiredBatchesAfter, planIssueThinning, runDataLayerRetention } from '@/lib/data-layer-retention-service';

const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 3650;

export interface CleanupPreview {
  cutoffDate: string;
  /** First day of the dense zone (the 15 newest import days) — every version from it on is kept. */
  denseStart: string | null;
  /** Import batches past the retention that would be left without any issue row, and removed. */
  emptyBatchCount: number;
  /** Versions (issues rows) that would be deleted, and how many of them are older than the retention vs. between the weekly snapshot dates. */
  issueVersionCount: number;
  issueVersionsBeyondRetention: number;
  issueVersionsInSparseZone: number;
  keptBridging: number;
  keptDense: number;
  keptNewestOld: number;
  retentionDays: number;
  totalRows: number;
}

export interface CleanupResult {
  batchesDeleted: number;
  cutoffDate: string;
  issueVersionsDeleted: number;
  retentionDays: number;
}

function assertValidRetentionDays(retentionDays: number): void {
  if (!Number.isInteger(retentionDays) || retentionDays < MIN_RETENTION_DAYS || retentionDays > MAX_RETENTION_DAYS) {
    throw new Error(`Số ngày giữ lại phải là số nguyên từ ${MIN_RETENTION_DAYS} đến ${MAX_RETENTION_DAYS}.`);
  }
}

/**
 * Manual run of the same history retention the daily job applies (data-layer-retention.ts), with its own
 * number of days. Beyond the 15 newest import days only the version in force at each weekly snapshot date is
 * kept, plus the newest version of every issue — so an Epic nobody touched for months never disappears.
 * epic_alert_timeline is untouched (its FK to import_batches is ON DELETE SET NULL).
 */
export async function previewCleanup(retentionDays: number): Promise<CleanupPreview> {
  assertValidRetentionDays(retentionDays);
  const plan = await planIssueThinning(undefined, retentionDays);
  return {
    cutoffDate: plan.cutoff,
    denseStart: plan.denseStart,
    emptyBatchCount: await countEmptyExpiredBatchesAfter(pool, plan.cutoff, plan.deleteIds),
    issueVersionCount: plan.deleteIds.length,
    issueVersionsBeyondRetention: plan.deleteBeyondRetention,
    issueVersionsInSparseZone: plan.deleteInSparseZone,
    keptBridging: plan.keptBridging,
    keptDense: plan.keptDense,
    keptNewestOld: plan.keptNewestOld,
    retentionDays,
    totalRows: plan.totalRows,
  };
}

export async function runCleanup(retentionDays: number): Promise<CleanupResult> {
  assertValidRetentionDays(retentionDays);
  const result = await runDataLayerRetention(undefined, retentionDays);
  return { batchesDeleted: result.batchesDeleted, cutoffDate: result.cutoff, issueVersionsDeleted: result.issueVersionsDeleted, retentionDays };
}
