import 'server-only';

import { listDomains, listProjectComponents, listProjects } from '@/lib/master-data-service';

/** Public TTM boundary used by HTTP/BFF adapters during the strangler migration. */
export { getTtmDashboard2, getTtmDashboard2Rows } from '@/modules/ttm/application/get-ttm-dashboard-2';
export {
  getReportAccessScope,
  reportAllowedComponents,
  reportScopeAllowsProject,
  scopeReportFilterOptions,
} from '@/lib/report-access-scope';
export { generateEpicReport, getReportLayerDates } from '@/lib/reports-service';
export type { ReportEpicItem, ReportFilterOptions, ReportResult } from '@/lib/reports-service';

/**
 * Compatibility read for the existing report filters. Projects becomes the owner of this contract
 * in the next architecture wave; keeping it here today avoids inventing an unfinished Project module.
 */
export async function listLegacyReportFilterReferences() {
  const [domains, projects, components] = await Promise.all([
    listDomains(),
    listProjects(),
    listProjectComponents(),
  ]);
  return { components, domains, projects };
}
