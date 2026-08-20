export interface DataReviewIssue {
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
