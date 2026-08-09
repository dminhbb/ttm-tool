import pool, { getClient } from './db';
import { parseCSV, mapCSVToRawIssues } from './csv-parser';
import { validateAllJiraIssues, parseJiraDate, RowValidationResult, ValidationError } from './validator';
import { accumulateProjectComponents } from './project-component-service';

export interface ImportBatch {
  id: number;
  fileName: string;
  importType: string;
  importedBy: string;
  importedAt: Date;
  aggregatedAt: Date;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  status: 'SUCCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
}

export interface BatchValidationDetail {
  rowNumber: number;
  rawData: Record<string, string>;
  validationStatus: string;
  validationErrors: ValidationError[];
}

export interface ImportResult {
  batchId: number;
  fileName: string;
  aggregatedAt: string;
  totalRows: number;
  successRows: number;
  warningRows: number;
  errorRows: number;
  status: 'SUCCESS' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
  validationReport: RowValidationResult[];
}

export async function processImport(
  fileName: string,
  csvText: string,
  aggregatedAtDate: Date,
  validateOnly: boolean = false
): Promise<ImportResult> {
  // 1. Parse CSV
  const parsedRows = parseCSV(csvText);
  const { issues: rawIssues } = mapCSVToRawIssues(parsedRows);
  const totalRows = rawIssues.length;

  // 2. Validate issues
  const validationReport = validateAllJiraIssues(rawIssues);
  
  let successRows = 0;
  let warningRows = 0;
  let errorRows = 0;

  for (const report of validationReport) {
    if (report.status === 'INVALID') {
      errorRows++;
    } else if (report.status === 'WARNING') {
      warningRows++;
    } else {
      successRows++;
    }
  }

  const batchStatus = errorRows > 0 
    ? 'FAILED' 
    : (warningRows > 0 ? 'COMPLETED_WITH_WARNINGS' : 'SUCCESS');

  // Return validation results early without saving to DB if validateOnly is true
  if (validateOnly) {
    return {
      batchId: 0,
      fileName,
      aggregatedAt: aggregatedAtDate.toISOString(),
      totalRows,
      successRows,
      warningRows,
      errorRows,
      status: batchStatus,
      validationReport
    };
  }

  // Connect to DB client
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // 3. Create Import Batch record
    const insertBatchQuery = `
      INSERT INTO import_batches (
        source_type, file_name, import_type, imported_by, aggregated_at, 
        total_rows, success_rows, warning_rows, error_rows, status, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id;
    `;
    const batchValues = [
      'CSV',
      fileName,
      'MANUAL',
      'System',
      aggregatedAtDate,
      totalRows,
      successRows,
      warningRows,
      errorRows,
      batchStatus,
      JSON.stringify({ validateOnly })
    ];

    const batchRes = await client.query(insertBatchQuery, batchValues);
    const batchId = batchRes.rows[0].id;

    // 4. Ingest Raw Import Rows into import_rows
    const insertRowQuery = `
      INSERT INTO import_rows (
        import_batch_id, row_number, raw_data_json, normalized_data_json, 
        validation_status, validation_errors_json
      ) VALUES ($1, $2, $3, $4, $5, $6);
    `;

    for (let i = 0; i < rawIssues.length; i++) {
      const issue = rawIssues[i];
      const validation = validationReport[i];
      await client.query(insertRowQuery, [
        batchId,
        issue.rowNumber,
        JSON.stringify(issue),
        JSON.stringify(issue),
        validation.status,
        JSON.stringify(validation.errors)
      ]);
    }

    // 5. Ingest into canonical issues table if NOT validateOnly AND status is NOT FAILED
    if (!validateOnly && batchStatus !== 'FAILED') {
      await accumulateProjectComponents(client, rawIssues);

      const insertIssueQuery = `
        INSERT INTO issues (
          source_system, jira_id, issue_key, issue_name, issue_type, current_status,
          standard_status, assignee_name, epic_key, parent_key,
          idea_approved_date, start_date, r4g_date, due_date, 
          epic_complexity_type, source_import_batch_id, aggregated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (issue_key, source_import_batch_id) DO UPDATE SET
          jira_id = EXCLUDED.jira_id,
          issue_name = EXCLUDED.issue_name,
          current_status = EXCLUDED.current_status,
          assignee_name = EXCLUDED.assignee_name,
          epic_key = EXCLUDED.epic_key,
          parent_key = EXCLUDED.parent_key,
          idea_approved_date = EXCLUDED.idea_approved_date,
          start_date = EXCLUDED.start_date,
          r4g_date = EXCLUDED.r4g_date,
          due_date = EXCLUDED.due_date,
          epic_complexity_type = EXCLUDED.epic_complexity_type,
          aggregated_at = EXCLUDED.aggregated_at,
          updated_at = NOW();
      `;

      for (const issue of rawIssues) {
        // Map Epic Complexity Type
        // Standardize: If "Complex" or "Phức tạp" in Epic Type, then COMPLEX, else SIMPLE.
        let complexity = 'SIMPLE';
        if (issue.epicType && (
          issue.epicType.toUpperCase().includes('COMPLEX') ||
          issue.epicType.toUpperCase().includes('PHỨC TẠP')
        )) {
          complexity = 'COMPLEX';
        }

        // Standard status (mock mapping for now, to be detailed later)
        const stdStatus = issue.status;

        const jiraId = parseInt(issue.issueId) || 0;

        await client.query(insertIssueQuery, [
          'JIRA',
          jiraId,
          issue.issueKey,
          issue.summary,
          issue.issueType.toUpperCase(),
          issue.status,
          stdStatus,
          issue.assignee || null,
          issue.epicLink || null,
          issue.parentId || null,
          parseJiraDate(issue.ideaApprovedDate),
          parseJiraDate(issue.startDate),
          parseJiraDate(issue.r4gDate),
          parseJiraDate(issue.dueDate),
          complexity,
          batchId,
          aggregatedAtDate
        ]);
      }

      // 6. Link relationships within the batch
      
      // Link parents (Subtasks -> Stories)
      const updateParentsQuery = `
        UPDATE issues child
        SET parent_id = parent.id
        FROM issues parent
        WHERE child.source_import_batch_id = $1
          AND parent.source_import_batch_id = $1
          AND child.parent_key = CAST(parent.jira_id AS VARCHAR)
          AND child.parent_key IS NOT NULL;
      `;
      await client.query(updateParentsQuery, [batchId]);

      // Link epics (Stories/Tasks/Bugs -> Epics)
      const updateEpicsQuery = `
        UPDATE issues story
        SET epic_id = epic.id
        FROM issues epic
        WHERE story.source_import_batch_id = $1
          AND epic.source_import_batch_id = $1
          AND story.epic_key = epic.issue_key
          AND story.epic_key IS NOT NULL;
      `;
      await client.query(updateEpicsQuery, [batchId]);

      // Link subtask directly to epic via parent's epic Link
      const updateSubtaskEpicsQuery = `
        UPDATE issues child
        SET epic_id = parent.epic_id
        FROM issues parent
        WHERE child.source_import_batch_id = $1
          AND parent.source_import_batch_id = $1
          AND child.parent_id = parent.id
          AND parent.epic_id IS NOT NULL;
      `;
      await client.query(updateSubtaskEpicsQuery, [batchId]);
    }

    await client.query('COMMIT');

    return {
      batchId,
      fileName,
      aggregatedAt: aggregatedAtDate.toISOString(),
      totalRows,
      successRows,
      warningRows,
      errorRows,
      status: batchStatus,
      validationReport
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import processing failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteImportBatch(batchId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // cascade delete handles related rows and issues automatically
    await client.query('DELETE FROM import_batches WHERE id = $1', [batchId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete import batch:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getImportHistory(): Promise<ImportBatch[]> {
  const res = await pool.query(`
    SELECT id, file_name as "fileName", import_type as "importType", 
           imported_by as "importedBy", imported_at as "importedAt", 
           aggregated_at as "aggregatedAt", total_rows as "totalRows", 
           success_rows as "successRows", warning_rows as "warningRows", 
           error_rows as "errorRows", status
    FROM import_batches
    ORDER BY imported_at DESC;
  `);
  return res.rows;
}

export async function getBatchValidationDetail(batchId: number): Promise<BatchValidationDetail[]> {
  const res = await pool.query(`
    SELECT row_number as "rowNumber", raw_data_json as "rawData", 
           validation_status as "validationStatus", 
           validation_errors_json as "validationErrors"
    FROM import_rows
    WHERE import_batch_id = $1
      AND (validation_status = 'INVALID' OR validation_status = 'WARNING')
    ORDER BY row_number ASC;
  `, [batchId]);
  return res.rows.map(row => ({
    rowNumber: row.rowNumber,
    rawData: JSON.parse(row.rawData),
    validationStatus: row.validationStatus,
    validationErrors: JSON.parse(row.validationErrors)
  }));
}
