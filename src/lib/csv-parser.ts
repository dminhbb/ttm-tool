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
  startDate: string;
  r4gDate: string;
  ideaApprovedDate: string;
  dueDate: string;
  rowNumber: number;
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
      startDate: getValue(idxStartDate),
      r4gDate: getValue(idxR4gDate),
      ideaApprovedDate: getValue(idxIdeaApprovedDate),
      dueDate: getValue(idxDueDate),
      rowNumber: r + 1 // 1-indexed row number in the CSV file
    });
  }
  
  return { issues, headers };
}
