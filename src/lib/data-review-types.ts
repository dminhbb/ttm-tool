export interface DataReviewIssue {
  /** "Actual Start Date" (Duyệt Epic → Issues in Epic, 2026-11-04): Epic_Real_Start_Date of an Epic,
   * Story_Real_Start_Date of a Story (crawl tool V16 / V16.1); always empty for a Subtask. */
  actualStartDate?: string | null;
  assignee: string;
  /** Which import data layer (aggregated_at) this issue's latest known row currently comes from. */
  dataLayerDate: string | null;
  dueDate: string | null;
  hasChildren: boolean;
  id: number;
  issueKey: string;
  issueType: string;
  jiraId: string;
  project: string;
  r4gDate: string | null;
  /** Team role (BA/DEV/TEST/PM) the issue's type maps to in issue_type_role_mapping, or "-" if
   * unmapped — see "Quản lý Issue Type" in Quản lý chung. */
  role: string;
  startDate: string | null;
  status: string;
  summary: string;
}

export interface DataReviewFilterOptions {
  componentsByProject: Record<string, string[]>;
  issueTypes: string[];
  projects: string[];
  statuses: string[];
}

export interface DataReviewEpicsResponse {
  filterOptions: DataReviewFilterOptions;
  items: DataReviewIssue[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DataReviewChildrenResponse {
  items: DataReviewIssue[];
}
