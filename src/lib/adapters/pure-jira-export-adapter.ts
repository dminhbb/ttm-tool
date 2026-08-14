/**
 * Pure Jira Export Adapter
 *
 * Parses CSV files exported directly from the Jira UI.
 * Column names are Jira's own export headers (English + Vietnamese aliases).
 * This adapter was the original / only import path before the Py Jira API adapter
 * was introduced.
 *
 * Column mapping uses fuzzy name matching — order in file does not matter.
 */

import { parseCSV, mapCSVToRawIssues, RawJiraIssue } from '../csv-parser';

export interface PureJiraExportParseResult {
  issues: RawJiraIssue[];
  headers: string[];
}

/**
 * Parse a raw CSV text string in Pure Jira Export format and return
 * a normalised list of RawJiraIssue objects ready for validation.
 */
export function parsePureJiraExport(csvText: string): PureJiraExportParseResult {
  const rows = parseCSV(csvText);
  return mapCSVToRawIssues(rows);
}
