import 'server-only';

/**
 * Public Integration compatibility boundary. Import remains synchronous in this wave so existing
 * HTTP status, response payload and transaction semantics do not change. A durable job adapter will
 * replace this implementation in the approved Integration increment.
 */
export { processImport as executeImport } from '@/lib/import-service';
export type { BatchValidationDetail, ImportBatch, ImportResult } from '@/lib/import-service';
export { ADAPTER_TYPES, DEFAULT_ADAPTER } from '@/lib/adapters/index';
export type { AdapterType } from '@/lib/adapters/index';
export { getLatestImportAggregatedAt } from '@/modules/integration/infrastructure/legacy-import-batch-repository';
