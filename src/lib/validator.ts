import { RawJiraIssue } from './csv-parser';
import { getIssueHierarchyLevel } from './issue-hierarchy';
import { isCancelledStatus, isPendingStatus } from './issue-status-rules';
import { STORY_WORKFLOW_STATUS_ORDER, storyWorkflowStatusIndex } from './story-workflow-rules';
import { SUBTASK_WORKFLOW_STATUS_ORDER, subtaskWorkflowStatusIndex } from './subtask-workflow-rules';

export interface ValidationError {
  type: 'ERROR' | 'WARNING';
  field: string;
  message: string;
}

export interface RowValidationResult {
  rowNumber: number;
  issueKey: string;
  issueType: string;
  summary: string;
  status: 'VALID' | 'INVALID' | 'WARNING';
  errors: ValidationError[];
}

export function parseJiraDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  dateStr = dateStr.trim();
  
  // Format 1: DD/MMM/YY hh:mm A or DD/MMM/YY hh:mm (e.g., 06/Aug/26 4:58 PM, 07/Aug/26 12:00 AM)
  const regexJira = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([PpMm]{2})?)?$/;
  const match = dateStr.match(regexJira);
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase();
    let year = parseInt(match[3]);
    if (year < 100) {
      year += 2000; // assume 20xx
    }
    
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthStr];
    if (month === undefined) return null;
    
    let hours = 0;
    let minutes = 0;
    if (match[4] && match[5]) {
      hours = parseInt(match[4]);
      minutes = parseInt(match[5]);
      if (match[6]) {
        const ampm = match[6].toLowerCase();
        if (ampm === 'pm' && hours < 12) {
          hours += 12;
        }
        if (ampm === 'am' && hours === 12) {
          hours = 0;
        }
      }
    }
    
    const date = new Date(year, month, day, hours, minutes, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Format 2: DD/MM/YYYY hh:mm
  const regexSlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/;
  const matchSlash = dateStr.match(regexSlash);
  if (matchSlash) {
    const day = parseInt(matchSlash[1]);
    const month = parseInt(matchSlash[2]) - 1;
    const year = parseInt(matchSlash[3]);
    let hours = 0;
    let minutes = 0;
    if (matchSlash[4] && matchSlash[5]) {
      hours = parseInt(matchSlash[4]);
      minutes = parseInt(matchSlash[5]);
    }
    const date = new Date(year, month, day, hours, minutes, 0, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // Format 3: YYYY-MM-DD (or YYYY-MM-DD HH:mm:ss / YYYY-MM-DDTHH:mm:ss)
  const regexIso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const matchIso = dateStr.match(regexIso);
  if (matchIso) {
    const year = parseInt(matchIso[1]);
    const month = parseInt(matchIso[2]) - 1;
    const day = parseInt(matchIso[3]);
    const hours = matchIso[4] ? parseInt(matchIso[4]) : 0;
    const minutes = matchIso[5] ? parseInt(matchIso[5]) : 0;
    const seconds = matchIso[6] ? parseInt(matchIso[6]) : 0;
    const date = new Date(year, month, day, hours, minutes, seconds, 0);
    if (!isNaN(date.getTime())) return date;
  }

  // Format 4: Fallback standard Date constructor
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  return null;
}

export function validateJiraIssue(issue: RawJiraIssue): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // 1. Mandatory base fields
  if (!issue.issueKey) {
    errors.push({
      type: 'ERROR',
      field: 'Issue key',
      message: 'Thiếu mã Issue (Issue Key)'
    });
  }
  
  if (!issue.summary) {
    errors.push({
      type: 'ERROR',
      field: 'Summary',
      message: 'Thiếu tiêu đề Issue (Summary)'
    });
  }
  
  if (!issue.issueType) {
    errors.push({
      type: 'ERROR',
      field: 'Issue Type',
      message: 'Thiếu loại Issue (Issue Type)'
    });
  }
  
  if (!issue.status) {
    errors.push({
      type: 'ERROR',
      field: 'Status',
      message: 'Thiếu trạng thái Issue (Status)'
    });
  }
  
  const hierarchyLevel = getIssueHierarchyLevel(issue.issueType);
  const isEpic = hierarchyLevel === 1;
  
  // 2. Date parsing validations
  const t0 = parseJiraDate(issue.ideaApprovedDate);
  const t1 = parseJiraDate(issue.startDate);
  const r4g = parseJiraDate(issue.r4gDate);
  const due = parseJiraDate(issue.dueDate);
  
  if (issue.ideaApprovedDate && !t0) {
    errors.push({
      type: 'ERROR',
      field: 'Ngày duyệt ý tưởng',
      message: `Ngày duyệt ý tưởng không đúng định dạng: "${issue.ideaApprovedDate}"`
    });
  }
  
  if (issue.startDate && !t1) {
    errors.push({
      type: 'ERROR',
      field: 'Start Date',
      message: `Ngày bắt đầu (Start Date) không đúng định dạng: "${issue.startDate}"`
    });
  }
  
  if (issue.r4gDate && !r4g) {
    errors.push({
      type: 'ERROR',
      field: 'R4G Date',
      message: `Ngày R4G (R4G Date) không đúng định dạng: "${issue.r4gDate}"`
    });
  }
  
  if (issue.dueDate && !due) {
    errors.push({
      type: 'ERROR',
      field: 'Due Date',
      message: `Ngày hết hạn (Due Date) không đúng định dạng: "${issue.dueDate}"`
    });
  }
  
  // 3. Logic date validation
  if (isEpic) {
    // Check if start date is null but epic is in In Progress/Design status
    const statusUpper = issue.status.toUpperCase();
    if (!issue.startDate && statusUpper !== 'TO DO' && statusUpper !== 'BACKLOG') {
      errors.push({
        type: 'WARNING',
        field: 'Start Date',
        message: `Epic ở trạng thái "${issue.status}" nhưng thiếu Ngày bắt đầu (Start Date)`
      });
    }
    
    // Check Start date (T1) vs Approval date (T0)
    if (t1 && t0 && t1 < t0) {
      errors.push({
        type: 'WARNING',
        field: 'Start Date',
        message: 'Ngày bắt đầu (Start Date / T1) trước Ngày duyệt ý tưởng (T0)'
      });
    }
    
    // Check R4G Date vs Start Date
    if (r4g && t1 && r4g < t1) {
      errors.push({
        type: 'ERROR',
        field: 'R4G Date',
        message: 'Ngày R4G (R4G Date) không được trước Ngày bắt đầu (Start Date)'
      });
    }
    
    // Check Due date vs T0
    if (due && t0 && due < t0) {
      errors.push({
        type: 'ERROR',
        field: 'Due Date',
        message: 'Ngày hoàn thành (Due Date) không được trước Ngày duyệt ý tưởng (T0)'
      });
    }
  } else {
    // Non-epics validation
    if (hierarchyLevel === 2 && !issue.epicLink) {
      errors.push({
        type: 'WARNING',
        field: 'Epic Link',
        message: 'Thiếu liên kết Epic (Epic Link)'
      });
    }
    
    if (hierarchyLevel === 3 && !issue.parentId && !issue.epicLink) {
      errors.push({
        type: 'WARNING',
        field: 'Parent ID',
        message: 'Subtask thiếu mã cha (Parent ID)'
      });
    }

    const isSpecialStatus = isPendingStatus(issue.status) || isCancelledStatus(issue.status);
    const statusOrder = hierarchyLevel === 2 ? storyWorkflowStatusIndex(issue.status) : subtaskWorkflowStatusIndex(issue.status);
    const workflowLength = hierarchyLevel === 2 ? STORY_WORKFLOW_STATUS_ORDER.length : SUBTASK_WORKFLOW_STATUS_ORDER.length;
    if (!isSpecialStatus && statusOrder >= workflowLength) {
      errors.push({
        type: 'WARNING',
        field: 'Status',
        message: `Status "${issue.status}" không thuộc workflow ${hierarchyLevel === 2 ? 'Story' : 'Subtask'} đã cấu hình`
      });
    }
  }
  
  return errors;
}

export function validateAllJiraIssues(issues: RawJiraIssue[]): RowValidationResult[] {
  return issues.map(issue => {
    const errors = validateJiraIssue(issue);
    let status: 'VALID' | 'INVALID' | 'WARNING' = 'VALID';
    
    if (errors.some(e => e.type === 'ERROR')) {
      status = 'INVALID';
    } else if (errors.some(e => e.type === 'WARNING')) {
      status = 'WARNING';
    }
    
    return {
      rowNumber: issue.rowNumber,
      issueKey: issue.issueKey || 'UNKNOWN',
      issueType: issue.issueType || 'UNKNOWN',
      summary: issue.summary || 'UNKNOWN',
      status,
      errors
    };
  });
}
