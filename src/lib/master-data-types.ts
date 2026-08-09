export interface Domain {
  createdAt: string;
  description: string;
  domainCode: string;
  domainName: string;
  id: number;
  isActive: boolean;
  leadName: string;
}

export interface DomainInput {
  description: string;
  domainCode: string;
  domainName: string;
  isActive: boolean;
  leadName: string;
}

export interface Project {
  createdAt: string;
  domainId: number | null;
  domainName: string | null;
  id: number;
  isActive: boolean;
  leadName: string;
  projectKey: string;
  projectName: string;
  sourceProjectKey: string;
  sourceType: string;
}

export interface ProjectInput {
  domainId: number | null;
  isActive: boolean;
  leadName: string;
  projectKey: string;
  projectName: string;
  sourceProjectKey: string;
  sourceType: string;
}

export type HolidayType = 'PUBLIC' | 'COMPANY' | 'OTHER';

export interface Holiday {
  createdAt: string;
  description: string;
  endDate: string;
  holidayType: HolidayType;
  id: number;
  isActive: boolean;
  isMultiDay: boolean;
  name: string;
  startDate: string;
}

export interface HolidayInput {
  description: string;
  endDate: string;
  holidayType: HolidayType;
  isActive: boolean;
  isMultiDay: boolean;
  name: string;
  startDate: string;
}
