/** One table of the application database ("Thông tin DB" tab). */
export interface BackupTableInfo {
  approxRowCount: number;
  /** Vietnamese name of the table; empty when it has none. */
  label: string;
  /** Table + its indexes + TOAST (pg_total_relation_size), in bytes. */
  sizeBytes: number;
  tableName: string;
}

export interface ImportTableResult {
  /** Rows the import removed from this table: the ones the file does not carry (full-sync tables), the
   * ones colliding with the file's on a unique key, and the surface-layer clean-up of a Smart import. */
  deleted: number;
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
