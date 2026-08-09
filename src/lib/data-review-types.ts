export interface DataReviewIssue {
  assignee: string;
  dueDate: string | null;
  id: number;
  issueKey: string;
  issueType: string;
  jiraId: string;
  project: string;
  r4gDate: string | null;
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
