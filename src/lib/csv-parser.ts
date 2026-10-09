export interface RawJiraIssue {
  summary: string;
  issueKey: string;
  issueId: string;
  parentId: string;
  issueType: string;
  status: string;
  projectKey: string;
  projectName: string;
  components: string;
  assignee: string;
  epicLink: string;
  epicName: string;
  epicStatus: string;
  epicType: string;
  requirementLevel: string;
  /** "Đơn vị yêu cầu" — epic_requesting_unit, epic rows only (Py Jira API adapter). */
  requestingUnit?: string;
  startDate: string;
  r4gDate: string;
  ideaApprovedDate: string;
  dueDate: string;
  rowNumber: number;
  // Source system timestamps — populated by adapters that provide creation/update info
  jiraCreatedAt?: string; // epic_created in Py Jira API format
  jiraUpdatedAt?: string; // epic_updated in Py Jira API format
  // Py Jira API adapter only — verbatim key lists from the source row, not derived.
  epicStories?: string[]; // epic_stories, on epic rows: this epic's story keys
  storySubtasks?: string[]; // story_subtasks, on story rows: this story's subtask keys
  // Status & TTM Fail cause fields (Py Jira API adapter & CSV import)
  previousStatus?: string; // epic_previous_status
  khauBa?: string;         // epic_khau_ba
  khauCo?: string;         // epic_khau_co
  khauDev?: string;        // epic_khau_dev
  khauPmSm?: string;       // epic_khau_pm_sm
  khauPo?: string;         // epic_khau_po
  khauPentest?: string;    // epic_khau_pentest
  khauSa?: string;         // epic_khau_sa
  khauSitUat?: string;     // epic_khau_sit_uat
  noteLyDoKhac?: string;   // epic_note_ly_do_khac
}

export function parseCSV(csvText: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = '';
  
  let i = 0;
  while (i < csvText.length) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      }
      currentVal += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        row.push(currentVal);
        result.push(row);
        row = [];
        currentVal = '';
        i++;
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentVal += char;
        i++;
      }
    }
  }
  
  if (row.length > 0 || currentVal !== '') {
    row.push(currentVal);
    result.push(row);
  }
  
  return result.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

export function mapCSVToRawIssues(rows: string[][]): { issues: RawJiraIssue[]; headers: string[] } {
  if (rows.length === 0) {
    return { issues: [], headers: [] };
  }
  
  const headers = rows[0].map(h => h.trim());
  const issues: RawJiraIssue[] = [];
  
  // Helper to find index by exact or fuzzy match
  const getIndex = (possibleNames: string[]): number => {
    return headers.findIndex(h => 
      possibleNames.some(name => h.toLowerCase() === name.toLowerCase())
    );
  };
  
  const idxSummary = getIndex(['Summary', 'Summary (Tóm tắt)']);
  const idxIssueKey = getIndex(['Issue key', 'Key', 'Issue Key']);
  const idxIssueId = getIndex(['Issue id', 'Issue ID', 'Id']);
  const idxParentId = getIndex(['Parent id', 'Parent ID', 'Parent']);
  const idxIssueType = getIndex(['Issue Type', 'Issue type', 'Type']);
  const idxStatus = getIndex(['Status', 'Trạng thái']);
  const idxProjectKey = getIndex(['Project key', 'Project Key']);
  const idxProjectName = getIndex(['Project name', 'Project Name']);
  const idxComponents = getIndex(['Component/s', 'Components', 'Component']);
  const idxAssignee = getIndex(['Assignee', 'Người xử lý']);
  const idxDueDate = getIndex(['Due Date', 'Due date', 'Hạn hoàn thành']);
  
  // Custom fields
  const idxEpicLink = getIndex(['Custom field (Epic Link)', 'Epic Link', 'Epic-Link']);
  const idxEpicName = getIndex(['Custom field (Epic Name)', 'Epic Name', 'Epic-Name']);
  const idxEpicStatus = getIndex(['Custom field (Epic Status)', 'Epic Status']);
  const idxEpicType = getIndex(['Custom field (Epic Type)', 'Epic Type']);
  const idxRequirementLevel = getIndex(['Custom field (Requirement Level)', 'Requirement Level', 'Mức độ yêu cầu']);
  const idxStartDate = getIndex(['Custom field (Start date)', 'Custom field (Start Date)', 'Start date', 'Start Date']);
  const idxR4gDate = getIndex(['Custom field (R4G Date)', 'R4G Date']);
  const idxIdeaApprovedDate = getIndex(['Custom field (Ngày duyệt ý tưởng)', 'Ngày duyệt ý tưởng', 'Idea Approved Date']);
  const idxRequestingUnit = getIndex(['Custom field (Đơn vị yêu cầu)', 'Đơn vị yêu cầu']);
  const idxPreviousStatus = getIndex(['epic_previous_status', 'Previous Status']);
  const idxKhauBa = getIndex(['epic_khau_ba', 'Khâu BA']);
  const idxKhauCo = getIndex(['epic_khau_co', 'Khâu CO']);
  const idxKhauDev = getIndex(['epic_khau_dev', 'Khâu DEV']);
  const idxKhauPmSm = getIndex(['epic_khau_pm_sm', 'Khâu PM/SM', 'Khâu PM SM']);
  const idxKhauPo = getIndex(['epic_khau_po', 'Khâu PO']);
  const idxKhauPentest = getIndex(['epic_khau_pentest', 'Khâu Pentest']);
  const idxKhauSa = getIndex(['epic_khau_sa', 'Khâu SA']);
  const idxKhauSitUat = getIndex(['epic_khau_sit_uat', 'Khâu SIT/UAT', 'Khâu SIT UAT']);
  const idxNoteLyDoKhac = getIndex(['epic_note_ly_do_khac', 'Note lý do khác']);
  
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // If row size is too short, pad with empty strings
    const getValue = (idx: number): string => {
      if (idx < 0 || idx >= row.length) return '';
      return row[idx].trim();
    };
    
    issues.push({
      summary: getValue(idxSummary),
      issueKey: getValue(idxIssueKey),
      issueId: getValue(idxIssueId),
      parentId: getValue(idxParentId),
      issueType: getValue(idxIssueType),
      status: getValue(idxStatus),
      projectKey: getValue(idxProjectKey),
      projectName: getValue(idxProjectName),
      components: getValue(idxComponents),
      assignee: getValue(idxAssignee),
      epicLink: getValue(idxEpicLink),
      epicName: getValue(idxEpicName),
      epicStatus: getValue(idxEpicStatus),
      epicType: getValue(idxEpicType),
      requirementLevel: getValue(idxRequirementLevel),
      requestingUnit: getValue(idxRequestingUnit),
      startDate: getValue(idxStartDate),
      r4gDate: getValue(idxR4gDate),
      ideaApprovedDate: getValue(idxIdeaApprovedDate),
      dueDate: getValue(idxDueDate),
      rowNumber: r + 1, // 1-indexed row number in the CSV file
      jiraCreatedAt: '',
      jiraUpdatedAt: '',
      previousStatus: getValue(idxPreviousStatus) || undefined,
      khauBa: getValue(idxKhauBa) || undefined,
      khauCo: getValue(idxKhauCo) || undefined,
      khauDev: getValue(idxKhauDev) || undefined,
      khauPmSm: getValue(idxKhauPmSm) || undefined,
      khauPo: getValue(idxKhauPo) || undefined,
      khauPentest: getValue(idxKhauPentest) || undefined,
      khauSa: getValue(idxKhauSa) || undefined,
      khauSitUat: getValue(idxKhauSitUat) || undefined,
      noteLyDoKhac: getValue(idxNoteLyDoKhac) || undefined,
    });
  }
  
  return { issues, headers };
}
