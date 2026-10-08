import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDashboardData } from '@/lib/dashboard-service';
import { getEpicBrowserRoot } from '@/lib/epic-browser-service';
import { ALERT_FILTER_VALUES, matchesAlertFilter, type AlertFilterValue } from '@/lib/epic-row-verdicts';
import { getEpicAlertRowsForDisplay } from '@/lib/epic-scoring-display-service';
import { isMcpToolName, MCP_TOOL_FEATURES, mcpToolViewDenied } from '@/lib/feature-access';
import { isCancelledStatus } from '@/lib/issue-status-rules';
import { scoreEpicByKey } from '@/lib/scoring-run-service';
import { BADGE_BY_ID, FINDING_GROUPS, SCORING_AXES } from '@/lib/scoring/catalog';
import { getReportAccessScope, scopeReportFilterOptions } from '@/lib/report-access-scope';
import { listDomains, listHolidays, listProjectComponents, listProjects } from '@/lib/master-data-service';
import { recordMcpAccessEvent } from '@/lib/mcp-service';
import { getViewDeniedFeatureKeySet } from '@/lib/permission-matrix-service';
import { getReportLayerDates } from '@/lib/reports-service';
import { getProductDocSections, PRODUCT_DOC_URL_PATH, searchProductDocs } from '@/lib/product-doc-service';
import { getTtmDashboard2Summary } from '@/lib/ttm-dashboard-2-summary-service';
import { listTtmPolicies } from '@/lib/ttm-policy-service';
import type { AuthUser, UserRole } from '@/lib/auth-types';

const REPORT_VIEW_ROLES: readonly UserRole[] = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'];
const TTM_POLICY_ROLES: readonly UserRole[] = ['SUPERADMIN', 'SUPERVISOR'];
const MAX_ALERT_ROWS = 200;
const DEFAULT_ALERT_ROWS = 50;
/** "Nhận xét" filter values of Quản trị Epic (epic-row-verdicts.ts) — list_epic_alerts' `nhanXet`. */
const NHAN_XET_VALUES = [...ALERT_FILTER_VALUES].filter(Boolean) as [Exclude<AlertFilterValue, ''>, ...Exclude<AlertFilterValue, ''>[]];

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
function summarizeAlertRow(row: Awaited<ReturnType<typeof getEpicAlertRowsForDisplay>>['rows'][number]) {
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
    // Present when the display engine is the Epic Scoring Service: active badge codes (see
    // get_epic_detail's `danhGia` for labels/messages).
    ...(row.scoringBadges ? { badges: row.scoringBadges } : {}),
  };
}

/** Epic Scoring Service verdicts for one Epic, labelled from the badge catalog (active findings only). */
async function describeScorecard(epicKey: string) {
  const card = await scoreEpicByKey(epicKey);
  if (!card) return null;
  return {
    asOf: card.asOf,
    findings: card.findings.filter((item) => !item.suppressedBy).map((item) => {
      const badge = BADGE_BY_ID.get(item.badge);
      return {
        badge: item.badge,
        label: badge?.label ?? item.badge,
        group: FINDING_GROUPS.find((group) => group.id === badge?.group)?.label ?? badge?.group,
        axis: SCORING_AXES.find((axis) => axis.id === badge?.axis)?.label ?? badge?.axis,
        ...(item.subject ? { phase: item.subject } : {}),
        message: item.message,
      };
    }),
  };
}

/**
 * Builds a fresh McpServer bound to one already-authenticated user (resolved from their Personal
 * Access Token by the /api/mcp route) — created per HTTP request since Vercel functions are
 * stateless and different requests can belong to different users. Every tool wraps an existing,
 * already-battle-tested service function instead of querying the DB directly, so an MCP caller
 * always sees exactly what that user would see in the app's own screens (same RBAC).
 *
 * Ma trận phân quyền (2026-10-08): every tool is tied to the screen(s) showing the same data
 * (MCP_TOOL_FEATURES, feature-access.ts). A role whose "Xem" is unticked on all of them gets a
 * refusal instead of the data — same rule as the page and its API in src/proxy.ts, so the matrix
 * can't be bypassed through a chatbot. Tools are registered through `registerTool` below, which
 * adds that check in front of every handler; a tool missing from MCP_TOOL_FEATURES fails loudly.
 */
export function buildMcpServer(user: AuthUser, tokenId: number): McpServer {
  const server = new McpServer(
    { name: 'ttm-tool', version: '1.3.0' },
    {
      instructions:
        'ttm-tool (TTM Monitor) — công cụ cảnh báo rủi ro chậm Time to Market cho Epic Jira. '
        + 'Số liệu tổng hợp: get_ttm_dashboard (màn TTM Dashboard 2 — phễu L01…L05bb, chỉ số TTM-CNTT (QLDA)/(QA), TTM-E2E). '
        + 'Danh sách / chi tiết Epic (dữ liệu màn Quản trị Epic): list_epic_alerts (lọc theo nhanXet để lấy Epic sau mỗi con số), get_epic_detail. '
        + 'Rule, cách tính, ý nghĩa badge/cảnh báo, hướng dẫn dùng màn hình: search_product_docs rồi get_product_doc_section — '
        + 'trả lời dựa trên Tài liệu sản phẩm và nêu số mục tham chiếu, không tự suy đoán rule. '
        + 'Mỗi công cụ gắn với một màn hình của ứng dụng: nếu vai trò của người dùng bị bỏ quyền Xem màn hình đó trong Ma trận phân quyền, '
        + 'công cụ trả về thông báo từ chối — hãy báo lại cho người dùng, không thử cách khác để lấy cùng dữ liệu.',
    },
  );
  const touch = () => recordMcpAccessEvent(user.id, tokenId);

  // Read once per request, on the first tool call. If the matrix can't be read, access is left to
  // the tools' own role checks (same fail-open choice as the proxy) rather than breaking MCP.
  let viewDenied: Promise<ReadonlySet<string> | null> | null = null;
  const loadViewDenied = () => (viewDenied ??= getViewDeniedFeatureKeySet(user.role).catch((error: unknown) => {
    console.error('Permission matrix lookup failed in MCP — falling back to role checks only:', error);
    return null;
  }));
  const registerTool = ((name, config, handler) => {
    if (!isMcpToolName(name)) throw new Error(`MCP tool "${name}" has no entry in MCP_TOOL_FEATURES (feature-access.ts).`);
    const guarded = async (...args: unknown[]) => {
      const denied = await loadViewDenied();
      if (denied && mcpToolViewDenied(name, denied)) {
        return forbidden(`Vai trò ${user.role} không có quyền Xem chức năng "${MCP_TOOL_FEATURES[name].screen}" trong Ma trận phân quyền, nên công cụ ${name} không trả dữ liệu. Liên hệ SUPERADMIN nếu cần được cấp quyền.`);
      }
      return (handler as (...handlerArgs: unknown[]) => unknown)(...args);
    };
    return server.registerTool(name, config, guarded as typeof handler);
  }) as typeof server.registerTool;

  registerTool(
    'list_epic_alerts',
    {
      title: 'Danh sách Epic đang được theo dõi cảnh báo TTM',
      description:
        'Trả về danh sách Epic cùng mức cảnh báo TTM (NONE/EARLY/LATE/FAIL), trạng thái hiện tại, dự án, domain, người phụ trách. '
        + 'Dữ liệu của màn hình "Quản trị Epic", lọc theo đúng quyền hạn (RBAC) của người dùng đang gọi. Dùng để trả lời các câu hỏi như "epic nào đang trễ", '
        + '"epic ABC-123 đang ở trạng thái gì", "dự án X có bao nhiêu cảnh báo mức cao", và để lấy danh sách Epic sau một con số của get_ttm_dashboard (tham số nhanXet).',
      inputSchema: {
        projectKey: z.string().trim().max(50).optional().describe('Lọc theo mã dự án Jira (project key), ví dụ "TTM".'),
        alertLevel: z.enum(['NONE', 'EARLY', 'LATE', 'FAIL']).optional().describe('Lọc theo mức cảnh báo.'),
        nhanXet: z.enum(NHAN_XET_VALUES).optional().describe(
          'Bộ lọc "Nhận xét" của màn Quản trị Epic. Tiêu chí phễu TTM Dashboard 2: IN_SCOPE_CNTT = L01 (cần includeCancelled = true để tính cả Epic Cancelled), TTM_COUNTED_IN_SCOPE = L02 (L01 − Cancelled − Epic ngoại lệ − dự án Time to Market = N), TTM_BLACK_LISTED = Epic ngoại lệ, TTM_PROJECT_NON_TTM = Epic thuộc dự án Time to Market = N, DATA_ANOMALY_IN_SCOPE = Sai lệch dữ liệu (L02 − L03), '
          + 'TTM_ELIGIBLE_IN_SCOPE = L04a, MISSING_R4G_IN_SCOPE = L04b, TTM_PASS_IN_SCOPE = L05aa, TTM_LATE_IN_SCOPE = L05ab, TTM_NOT_SCORED_IN_SCOPE = L05ac, '
          + 'OVERDUE_MISSING_R4G_IN_SCOPE = L05ba, WITHIN_TARGET_MISSING_R4G = L05bb, OUT_OF_SCOPE_CNTT = ngoài "Phạm vi dữ liệu cho TTM". '
          + 'Khác: ACHIEVED_E2E / FAIL_E2E, LATE (Chậm tiến độ), DATA_ANOMALY, PENDING_TOO_LONG, WAITING_GOLIVE (+ _MISSING_R4G / _WITHIN_GRACE / _OVERDUE), JUSTIFY_GOLIVE, STATUS_MISMATCH.',
        ),
        includeCancelled: z.boolean().optional().describe('Chỉ có tác dụng khi dùng nhanXet: true = tính cả Epic Cancelled (mặc định loại, giống màn Quản trị Epic).'),
        search: z.string().trim().max(100).optional().describe('Tìm theo mã hoặc tên Epic (không phân biệt hoa/thường).'),
        limit: z.number().int().min(1).max(MAX_ALERT_ROWS).optional().describe(`Số dòng tối đa trả về (mặc định ${DEFAULT_ALERT_ROWS}, tối đa ${MAX_ALERT_ROWS}).`),
      },
    },
    async ({ projectKey, alertLevel, nhanXet, includeCancelled, search, limit }) => {
      const { rows, lastAggregatedAt, viewerName } = await getEpicAlertRowsForDisplay(user.id, user.role);
      const searchLower = search?.toLowerCase();
      const filtered = rows.filter((row) =>
        (!projectKey || row.projectKey.toLowerCase() === projectKey.toLowerCase())
        && (!alertLevel || row.alertLevel === alertLevel)
        && (!nhanXet || (matchesAlertFilter(row, nhanXet) && (includeCancelled || !isCancelledStatus(row.currentStatus || ''))))
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

  registerTool(
    'get_epic_detail',
    {
      title: 'Chi tiết một Epic',
      description: 'Tra cứu chi tiết một Epic theo mã (epicKey) — trạng thái Jira, người phụ trách, ngày due/start/R4G, dự án, và `danhGia`: '
        + 'danh sách đánh giá của Scoring Service (badge, nhóm Cảnh báo/Đạt/Fail/Khuyến nghị/Ghi nhận, trục, nội dung).',
      inputSchema: {
        epicKey: z.string().trim().min(1).max(50).describe('Mã Epic trên Jira, ví dụ "TTM-1234".'),
      },
    },
    async ({ epicKey }) => {
      const issue = await getEpicBrowserRoot(epicKey);
      await touch();
      if (!issue) return forbidden(`Không tìm thấy Epic "${epicKey}".`);
      const danhGia = await describeScorecard(epicKey).catch(() => null);
      return json({ ...issue, danhGia });
    },
  );

  registerTool(
    'get_dashboard_summary',
    {
      title: 'Tổng quan Dashboard TTM',
      description:
        'Trả về số liệu tổng hợp (số epic đạt/trễ TTM, phân bố trạng thái, top epic rủi ro cao...) — tương đương màn hình Dashboard CŨ (/dashboard). '
        + 'Với câu hỏi về chỉ số TTM hiện hành (TTM-CNTT (QLDA), TTM-CNTT (QA), TTM-E2E, Chờ golive, Giải trình Golive...), dùng get_ttm_dashboard (màn TTM Dashboard 2). '
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

  registerTool(
    'get_ttm_dashboard',
    {
      title: 'Số liệu màn hình TTM Dashboard 2',
      description:
        'Trả về số liệu của màn hình "TTM Dashboard 2" (/ttm-dashboard-2 — màn hình mặc định sau khi đăng nhập) theo đúng quyền dữ liệu (RBAC) của người dùng đang gọi: '
        + 'phễu Epic theo tiêu chí L01…L05bb (Tổng epic, loại Cancelled, loại Sai lệch dữ liệu, Epic hoàn thành / chưa hoàn thành, Đạt / Không đạt / Chưa kết luận / Trong hạn), '
        + 'chỉ số TTM-CNTT (QLDA), TTM-CNTT (QA), TTM-E2E (Tỷ lệ % Pass = Đạt / (Đạt + Fail)) của tập đang xem và của toàn công ty, '
        + 'các widget Fail TTM-CNTT, Chậm tiến độ, Sai lệch dữ liệu, Chờ golive (thiếu R4G / trong hạn / quá hạn), Giải trình Golive, '
        + 'và bảng phân tích theo chiều (dự án / domain / PM-SM / phân loại Epic / đơn vị yêu cầu). '
        + 'Dùng cho câu hỏi kiểu "TTM-CNTT (QLDA) domain X bao nhiêu", "có bao nhiêu epic fail TTM", "dự án nào nhiều Epic sai lệch dữ liệu nhất". '
        + 'Tool chỉ trả số tổng hợp — danh sách Epic sau mỗi con số lấy bằng list_epic_alerts (tham số nhanXet); rule/cách tính: search_product_docs.',
      inputSchema: {
        projectKeys: z.array(z.string().trim().min(1).max(50)).max(50).optional().describe('Lọc theo danh sách mã dự án (project key).'),
        domain: z.string().trim().max(200).optional().describe('Lọc theo tên domain (không phân biệt hoa/thường).'),
        pmSms: z.array(z.string().trim().min(1).max(200)).max(20).optional().describe('Lọc theo tên PM/SM phụ trách (Epic của bất kỳ người nào trong danh sách).'),
        requestingUnits: z.array(z.string().trim().min(1).max(200)).max(20).optional().describe('Lọc theo Đơn vị yêu cầu.'),
        dimension: z.enum(['project', 'domain', 'pmsm', 'epicType', 'requestingUnit']).optional().describe('Chiều phân tích cho bảng breakdown (mặc định project).'),
      },
    },
    async (filters) => {
      const summary = await getTtmDashboard2Summary(user.id, user.role, filters);
      await touch();
      return json(summary);
    },
  );

  registerTool(
    'search_product_docs',
    {
      title: 'Tra cứu Tài liệu sản phẩm TTM Tool',
      description:
        'Tìm kiếm trong "Tài liệu sản phẩm" của ứng dụng ttm-tool (TTM Monitor) — nguồn chính thức mô tả workflow, chức năng từng màn hình, '
        + 'phân quyền, import dữ liệu và ĐẶC BIỆT là các rule logic cảnh báo & tính toán: TTM-CNTT (QLDA)/TTM-E2E, cảnh báo sớm/muộn/Fail, baseline từng pha, '
        + 'Sai Status, trục Release (Chờ golive/Giải trình Golive), sai lệch dữ liệu, chỉ số TTM-CNTT (QLDA)/TTM-CNTT (QA), Phạm vi dữ liệu cho TTM, Epic Type... '
        + 'Trả về các mục liên quan nhất kèm nội dung. Luôn dùng tool này trước khi trả lời câu hỏi "tại sao/cách tính/rule" về ứng dụng, '
        + 'và trích dẫn số mục (id) khi trả lời. Tìm kiếm không phân biệt dấu tiếng Việt.',
      inputSchema: {
        query: z.string().trim().min(2).max(300).describe('Câu hỏi hoặc từ khoá, ví dụ "cách tính cảnh báo muộn", "TTM-CNTT (QA)", "Giải trình Golive".'),
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
    'list_report_filters',
    {
      title: 'Danh mục lọc cho Báo cáo Epic',
      description: 'Trả về danh sách domain, dự án, component và các lớp dữ liệu (layer date) hiện có — dùng để biết những giá trị hợp lệ khi hỏi sâu hơn về một dự án/component cụ thể.',
      inputSchema: {},
    },
    async () => {
      const [scope, allDomains, allProjects, allComponents, layerDates] = await Promise.all([
        getReportAccessScope(user),
        listDomains(),
        listProjects(),
        listProjectComponents(),
        getReportLayerDates(),
      ]);
      // Same scope as the Báo cáo Epic screen (report-access-scope.ts).
      const { components, domains, projects } = scopeReportFilterOptions(scope, allDomains, allProjects, allComponents);
      await touch();
      return json({ domains, projects, components, layerDates });
    },
  );

  return server;
}
