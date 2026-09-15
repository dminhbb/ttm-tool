import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDashboardData } from '@/lib/dashboard-service';
import { getEpicBrowserRoot } from '@/lib/epic-browser-service';
import { getEpicAlertRowsPhased } from '@/lib/epic-alert-phase-service';
import { listDomains, listHolidays, listProjectComponents, listProjects } from '@/lib/master-data-service';
import { recordMcpAccessEvent } from '@/lib/mcp-service';
import { getReportLayerDates } from '@/lib/reports-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import type { AuthUser, UserRole } from '@/lib/auth-types';

const REPORT_VIEW_ROLES: readonly UserRole[] = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'];
const TTM_POLICY_ROLES: readonly UserRole[] = ['SUPERADMIN', 'SUPERVISOR'];
const MAX_ALERT_ROWS = 200;
const DEFAULT_ALERT_ROWS = 50;

function forbidden(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function json(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function hasRole(user: AuthUser, roles: readonly UserRole[]): boolean {
  return roles.includes(user.role);
}

/** Compact projection of EpicAlertRowPhased — the full row also carries per-phase baseline cells
 * (stages.*) which are UI-rendering detail an AI chatbot answer has no use for and would just
 * bloat the tool response; ask get_epic_detail for the full picture on one specific Epic. */
function summarizeAlertRow(row: Awaited<ReturnType<typeof getEpicAlertRowsPhased>>['rows'][number]) {
  return {
    alertLevel: row.alertLevel,
    currentStatus: row.currentStatus,
    domainName: row.domainName,
    dueDate: row.dueDate,
    epicKey: row.epicKey,
    epicName: row.epicName,
    epicType: row.epicType,
    hasDataAnomaly: row.hasDataAnomaly,
    ownerName: row.ownerName,
    projectKey: row.projectKey,
    projectName: row.projectName,
    r4gDate: row.r4gDate,
    remainingWorkingDays: row.remainingWorkingDays,
    ttmE2eAlertLevel: row.ttmE2eAlertLevel,
  };
}

/**
 * Builds a fresh McpServer bound to one already-authenticated user (resolved from their Personal
 * Access Token by the /api/mcp route) — created per HTTP request since Vercel functions are
 * stateless and different requests can belong to different users. Every tool wraps an existing,
 * already-battle-tested service function instead of querying the DB directly, so an MCP caller
 * always sees exactly what that user would see in the app's own screens (same RBAC).
 */
export function buildMcpServer(user: AuthUser, tokenId: number): McpServer {
  const server = new McpServer({ name: 'ttm-tool', version: '1.0.0' });
  const touch = () => recordMcpAccessEvent(user.id, tokenId);

  server.registerTool(
    'list_epic_alerts',
    {
      title: 'Danh sách Epic đang được theo dõi cảnh báo TTM',
      description:
        'Trả về danh sách Epic cùng mức cảnh báo TTM (NONE/EARLY/LATE/FAIL), trạng thái hiện tại, dự án, domain, người phụ trách. '
        + 'Dữ liệu được lọc theo đúng quyền hạn (RBAC) của người dùng đang gọi. Dùng để trả lời các câu hỏi như "epic nào đang trễ", '
        + '"epic ABC-123 đang ở trạng thái gì", "dự án X có bao nhiêu cảnh báo mức cao".',
      inputSchema: {
        projectKey: z.string().trim().max(50).optional().describe('Lọc theo mã dự án Jira (project key), ví dụ "TTM".'),
        alertLevel: z.enum(['NONE', 'EARLY', 'LATE', 'FAIL']).optional().describe('Lọc theo mức cảnh báo.'),
        search: z.string().trim().max(100).optional().describe('Tìm theo mã hoặc tên Epic (không phân biệt hoa/thường).'),
        limit: z.number().int().min(1).max(MAX_ALERT_ROWS).optional().describe(`Số dòng tối đa trả về (mặc định ${DEFAULT_ALERT_ROWS}, tối đa ${MAX_ALERT_ROWS}).`),
      },
    },
    async ({ projectKey, alertLevel, search, limit }) => {
      const { rows, lastAggregatedAt, viewerName } = await getEpicAlertRowsPhased(user.id, user.role);
      const searchLower = search?.toLowerCase();
      const filtered = rows.filter((row) =>
        (!projectKey || row.projectKey.toLowerCase() === projectKey.toLowerCase())
        && (!alertLevel || row.alertLevel === alertLevel)
        && (!searchLower || row.epicKey.toLowerCase().includes(searchLower) || row.epicName.toLowerCase().includes(searchLower)),
      );
      await touch();
      return json({
        viewerName,
        lastAggregatedAt,
        totalMatched: filtered.length,
        returned: Math.min(filtered.length, limit ?? DEFAULT_ALERT_ROWS),
        epics: filtered.slice(0, limit ?? DEFAULT_ALERT_ROWS).map(summarizeAlertRow),
      });
    },
  );

  server.registerTool(
    'get_epic_detail',
    {
      title: 'Chi tiết một Epic',
      description: 'Tra cứu chi tiết một Epic theo mã (epicKey) — trạng thái Jira, người phụ trách, ngày due/start/R4G, dự án.',
      inputSchema: {
        epicKey: z.string().trim().min(1).max(50).describe('Mã Epic trên Jira, ví dụ "TTM-1234".'),
      },
    },
    async ({ epicKey }) => {
      const issue = await getEpicBrowserRoot(epicKey);
      await touch();
      if (!issue) return forbidden(`Không tìm thấy Epic "${epicKey}".`);
      return json(issue);
    },
  );

  server.registerTool(
    'get_dashboard_summary',
    {
      title: 'Tổng quan Dashboard TTM',
      description:
        'Trả về số liệu tổng hợp (số epic đạt/trễ TTM, phân bố trạng thái, top epic rủi ro cao...) — tương đương màn hình Dashboard. '
        + 'Có thể chọn 1-3 dự án cụ thể; nếu bỏ trống, trả về theo phạm vi mặc định của người dùng.',
      inputSchema: {
        projectKeys: z.array(z.string().trim().max(50)).min(1).max(3).optional().describe('Danh sách 1-3 mã dự án muốn xem (project key).'),
      },
    },
    async ({ projectKeys }) => {
      const data = await getDashboardData(user.id, user.role, projectKeys ?? null);
      await touch();
      return json(data);
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'Danh sách dự án',
      description: 'Trả về danh sách dự án đang quản lý trong ttm-tool (mã dự án, tên, domain, trạng thái TTM). Chỉ dành cho ADMIN/SUPERVISOR/SUPERADMIN.',
      inputSchema: {},
    },
    async () => {
      if (!hasRole(user, REPORT_VIEW_ROLES)) return forbidden('Chỉ ADMIN/SUPERVISOR/SUPERADMIN được xem danh sách dự án.');
      const projects = await listProjects();
      await touch();
      return json(projects);
    },
  );

  server.registerTool(
    'list_domains',
    {
      title: 'Danh sách domain nghiệp vụ',
      description: 'Trả về danh sách domain (nhóm dự án theo nghiệp vụ). Chỉ dành cho ADMIN/SUPERVISOR/SUPERADMIN.',
      inputSchema: {},
    },
    async () => {
      if (!hasRole(user, REPORT_VIEW_ROLES)) return forbidden('Chỉ ADMIN/SUPERVISOR/SUPERADMIN được xem danh sách domain.');
      const domains = await listDomains();
      await touch();
      return json(domains);
    },
  );

  server.registerTool(
    'list_holidays',
    {
      title: 'Danh sách ngày nghỉ lễ',
      description: 'Trả về danh sách ngày nghỉ lễ đã cấu hình (dùng để tính ngày làm việc còn lại của Epic). Chỉ dành cho ADMIN/SUPERVISOR/SUPERADMIN.',
      inputSchema: {
        year: z.number().int().min(2000).max(2100).optional().describe('Chỉ lấy ngày nghỉ của năm này (mặc định lấy tất cả).'),
      },
    },
    async ({ year }) => {
      if (!hasRole(user, REPORT_VIEW_ROLES)) return forbidden('Chỉ ADMIN/SUPERVISOR/SUPERADMIN được xem danh sách ngày nghỉ.');
      const holidays = await listHolidays(year);
      await touch();
      return json(holidays);
    },
  );

  server.registerTool(
    'get_ttm_policies',
    {
      title: 'Chính sách / tiêu chí Time to Market',
      description: 'Trả về toàn bộ tiêu chí Time to Market (TTM_CNTT/TTM_E2E) theo độ phức tạp Epic — số ngày làm việc mục tiêu giữa các mốc. Chỉ dành cho SUPERVISOR/SUPERADMIN.',
      inputSchema: {},
    },
    async () => {
      if (!hasRole(user, TTM_POLICY_ROLES)) return forbidden('Chỉ SUPERVISOR/SUPERADMIN được xem chính sách Time to Market.');
      const policies = await listTtmPolicies();
      await touch();
      return json(policies);
    },
  );

  server.registerTool(
    'list_report_filters',
    {
      title: 'Danh mục lọc cho Báo cáo Epic',
      description: 'Trả về danh sách domain, dự án, component và các lớp dữ liệu (layer date) hiện có — dùng để biết những giá trị hợp lệ khi hỏi sâu hơn về một dự án/component cụ thể.',
      inputSchema: {},
    },
    async () => {
      const [domains, projects, components, layerDates] = await Promise.all([
        listDomains(),
        listProjects(),
        listProjectComponents(),
        getReportLayerDates(),
      ]);
      await touch();
      return json({ domains, projects, components, layerDates });
    },
  );

  return server;
}
