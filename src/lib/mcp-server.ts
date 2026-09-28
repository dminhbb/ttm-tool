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
import { getProductDocSections, PRODUCT_DOC_URL_PATH, searchProductDocs } from '@/lib/product-doc-service';
import { getTtmDashboardSummary } from '@/lib/ttm-dashboard-summary-service';
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
  const server = new McpServer(
    { name: 'ttm-tool', version: '1.1.0' },
    {
      instructions:
        'ttm-tool (TTM Monitor) — công cụ cảnh báo rủi ro chậm Time to Market cho Epic Jira. '
        + 'Số liệu: get_ttm_dashboard (màn TTM dashboard), list_epic_alerts / get_epic_detail (từng Epic). '
        + 'Rule, cách tính, ý nghĩa badge/cảnh báo, hướng dẫn dùng màn hình: search_product_docs rồi get_product_doc_section — '
        + 'trả lời dựa trên Tài liệu sản phẩm và nêu số mục tham chiếu, không tự suy đoán rule.',
    },
  );
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
        'Trả về số liệu tổng hợp (số epic đạt/trễ TTM, phân bố trạng thái, top epic rủi ro cao...) — tương đương màn hình Dashboard CŨ (/dashboard). '
        + 'Với câu hỏi về màn hình "TTM dashboard" hiện hành (TTM-Index, QA-Index, Chờ golive, Giải trình Golive...), ưu tiên dùng get_ttm_dashboard. '
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
    'get_ttm_dashboard',
    {
      title: 'Số liệu màn hình TTM dashboard',
      description:
        'Trả về toàn bộ số liệu của màn hình "TTM dashboard" (/dashboard-new) theo đúng quyền dữ liệu (RBAC) của người dùng đang gọi: '
        + 'KPI (tổng số Epic, TTM-Index QLDA, QA-Index, Fail TTM-CNTT/E2E, Cảnh báo sớm/muộn, Sai lệch dữ liệu, Chờ golive, Cảnh báo sớm Release, '
        + 'Giải trình Golive, Ngoài phạm vi TTM-CNTT), TTM-Index toàn hệ thống, phân bố trạng thái, pipeline 5 pha, top 5 dự án rủi ro, '
        + 'bảng phân tích theo chiều (dự án/domain/PM-SM/Epic type/đơn vị yêu cầu) và danh sách Epic chi tiết cho từng nhóm. '
        + 'Dùng cho câu hỏi kiểu "TTM-Index domain X bao nhiêu", "có bao nhiêu epic chờ golive", "dự án nào rủi ro nhất". '
        + 'Muốn biết rule/cách tính của một chỉ số, dùng search_product_docs.',
      inputSchema: {
        projectKeys: z.array(z.string().trim().min(1).max(50)).max(20).optional().describe('Lọc theo danh sách mã dự án (project key).'),
        domain: z.string().trim().max(200).optional().describe('Lọc theo tên domain (khớp chính xác, không phân biệt hoa/thường).'),
        pmSm: z.string().trim().max(200).optional().describe('Lọc theo tên PM/SM phụ trách.'),
        dimension: z.enum(['project', 'domain', 'pmsm', 'epicType', 'requestingUnit']).optional().describe('Chiều phân tích cho bảng breakdown (mặc định project).'),
        ttmScopeCnttFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Ghi đè "R4G for TTM (CNTT)" từ ngày (yyyy-mm-dd); null = không giới hạn; bỏ trống = dùng cấu hình mặc định.'),
        ttmScopeCnttTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Ghi đè "R4G for TTM (CNTT)" đến ngày (yyyy-mm-dd).'),
        ttmScopeQaFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Ghi đè "R4G for TTM (QA)" từ ngày (yyyy-mm-dd).'),
        ttmScopeQaTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Ghi đè "R4G for TTM (QA)" đến ngày (yyyy-mm-dd).'),
        listLimit: z.number().int().min(0).max(100).optional().describe('Số Epic tối đa trong mỗi danh sách chi tiết (mặc định 20).'),
      },
    },
    async (filters) => {
      const summary = await getTtmDashboardSummary(user.id, user.role, filters);
      await touch();
      return json(summary);
    },
  );

  server.registerTool(
    'search_product_docs',
    {
      title: 'Tra cứu Tài liệu sản phẩm TTM Tool',
      description:
        'Tìm kiếm trong "Tài liệu sản phẩm" của ứng dụng ttm-tool (TTM Monitor) — nguồn chính thức mô tả workflow, chức năng từng màn hình, '
        + 'phân quyền, import dữ liệu và ĐẶC BIỆT là các rule logic cảnh báo & tính toán: TTM-CNTT/TTM-E2E, cảnh báo sớm/muộn/Fail, baseline từng pha, '
        + 'Sai Status, trục Release (Chờ golive/Giải trình Golive), sai lệch dữ liệu, TTM-Index/QA-Index, Phạm vi dữ liệu cho TTM, Epic Type... '
        + 'Trả về các mục liên quan nhất kèm nội dung. Luôn dùng tool này trước khi trả lời câu hỏi "tại sao/cách tính/rule" về ứng dụng, '
        + 'và trích dẫn số mục (id) khi trả lời. Tìm kiếm không phân biệt dấu tiếng Việt.',
      inputSchema: {
        query: z.string().trim().min(2).max(300).describe('Câu hỏi hoặc từ khoá, ví dụ "cách tính cảnh báo muộn", "QA-Index", "Giải trình Golive".'),
        limit: z.number().int().min(1).max(10).optional().describe('Số mục trả về (mặc định 4).'),
      },
    },
    async ({ query, limit }) => {
      const hits = await searchProductDocs(query, limit ?? 4);
      await touch();
      if (hits.length === 0) {
        return json({ query, hits: [], hint: 'Không tìm thấy mục phù hợp — thử từ khoá khác, hoặc gọi get_product_doc_section (không truyền id) để xem mục lục.' });
      }
      return json({ query, source: `Tài liệu sản phẩm (${PRODUCT_DOC_URL_PATH})`, hits });
    },
  );

  server.registerTool(
    'get_product_doc_section',
    {
      title: 'Đọc một mục trong Tài liệu sản phẩm',
      description:
        'Đọc đầy đủ nội dung một mục của "Tài liệu sản phẩm" ttm-tool theo id (số mục, ví dụ "8.3", "8.7", "11.5"). '
        + 'Không truyền id để lấy mục lục (danh sách id + tiêu đề) của toàn bộ tài liệu.',
      inputSchema: {
        id: z.string().trim().max(20).optional().describe('Số mục, ví dụ "8.6". Bỏ trống để lấy mục lục.'),
      },
    },
    async ({ id }) => {
      const sections = await getProductDocSections();
      await touch();
      if (!id) {
        return json({ source: `Tài liệu sản phẩm (${PRODUCT_DOC_URL_PATH})`, toc: sections.map(({ id: sectionId, level, title }) => ({ id: sectionId, level, title })) });
      }
      const normalizedId = id.replace(/\.$/, '');
      const section = sections.find((item) => item.id === normalizedId);
      if (!section) return forbidden(`Không có mục "${id}" trong Tài liệu sản phẩm. Gọi get_product_doc_section không truyền id để xem mục lục.`);
      // A chapter heading (h2) also returns its sub-sections, so "8" gives the whole chapter.
      const children = section.level === 2 ? sections.filter((item) => item.level === 3 && item.id.startsWith(`${section.id}.`)) : [];
      return json({ source: `Tài liệu sản phẩm (${PRODUCT_DOC_URL_PATH})`, section, subSections: children });
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
