export interface BackupTableInfo {
  approxRowCount: number;
  label: string;
  tableName: string;
}

export interface ExportRequest {
  includeSchema: boolean;
  tables: string[];
}

export interface ImportTableResult {
  error: string | null;
  inserted: number;
  skippedDuplicates: number;
  tableName: string;
}

export interface ImportResult {
  ok: boolean;
  tables: ImportTableResult[];
}
