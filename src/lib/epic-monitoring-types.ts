import type { AlertLevel } from '@/lib/ttm-rules';

export interface MonitoredEpic {
  alertLevel: AlertLevel;
  assignee: string;
  daysRemaining: number | null;
  daysSinceT0: number | null;
  domain: string;
  dueDate: string | null;
  epicKey: string;
  epicName: string;
  epicType: string | null;
  ideaApprovedDate: string | null;
  missingStandardInfo: string[];
  project: string;
  r4gDate: string | null;
  startDate: string | null;
  status: string;
  targetR4gDate: string | null;
}

export interface EpicMonitoringResponse {
  from: string;
  panel1: MonitoredEpic[];
  panel2: MonitoredEpic[];
  panel3: MonitoredEpic[];
  to: string;
}
