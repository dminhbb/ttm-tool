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
  /** Rows whose primary key matched an existing row — overwritten with the file's data
   * (INSERT ... ON CONFLICT (pk) DO UPDATE SET, see exportTablesToSql). Always 0 for a file
   * exported before this upsert behavior existed (ON CONFLICT DO NOTHING — those still land in
   * skippedDuplicates instead, for backward compatibility with older export files). */
  updated: number;
  skippedDuplicates: number;
  tableName: string;
}

export interface ImportResult {
  ok: boolean;
  tables: ImportTableResult[];
}
