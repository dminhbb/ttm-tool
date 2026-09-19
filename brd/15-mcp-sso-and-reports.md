# 15 — Báo cáo Epic, MCP Server và SSO/API Key

> File mới (chưa từng có trong bộ BRD 00-14) — tài liệu hoá 3 mảng đã build xong trong code nhưng
> chưa có source of truth dạng BRD: màn hình **Báo cáo Epic**, **MCP Server** (kết nối AI chatbot),
> và **SSO/API Key** (TTM Monitor đóng vai trò SSO Provider cho ứng dụng khác). Cả 3 đều KHÔNG nằm
> trong phạm vi MVP1 gốc — là tính năng bổ sung sau này (migration `2026090x`-`2026091x`).

## 1. Báo cáo Epic (`/reports`)

Route mới, mục đầu tiên trong nhóm "Giám sát" trên sidebar — mở cho **mọi role đã đăng nhập**
(`requireUser`, không giới hạn role trong route handler). Feature key `epic_reports` (category
`VIEW_ONLY`) được thêm vào Ma trận phân quyền qua `20260909_add_epic_reports_permission.sql` (xem
`08-data-model.md` §14) nhưng — giống toàn bộ Ma trận phân quyền — chưa có API nào thực sự đọc
`role_feature_permissions` để chặn/cho phép; phân quyền thật vẫn chỉ là "đăng nhập là xem được".

Khác với Dashboard (gộp nhiều dự án theo tỷ lệ %), đây là báo cáo **theo đúng 1 dự án** tại một thời
điểm, dùng để tra cứu/in ấn/đối chiếu theo lớp dữ liệu:

- Bộ lọc: Dự án (bắt buộc, chọn 1), Domain, Component, khoảng ngày (Epic tạo mới từ/Epic start từ/
  Epic golive sau), và chọn 1 hoặc nhiều trong **tối đa 7 lớp dữ liệu (`aggregated_at`) gần nhất**
  (`getReportLayerDates()`, `src/lib/reports-service.ts`) để "drill" xuống dữ liệu của các ngày
  import cũ hơn thay vì chỉ xem lớp mới nhất.
- Engine tính toán dùng lại nguyên vẹn — **không** viết công thức riêng:
  `evaluateIssueCompliance` (`epic-compliance-engine.ts`), `evaluateEpicDataAnomaly`/
  `breaksTtmCnttCalculation`/`breaksTtmE2eCalculation` (`epic-data-anomaly.ts`),
  `resolveTtmE2eRelease` (`epic-alert-service.ts`), `listActiveStatusAlertRules`
  (`status-alert-rule-service.ts`), `resolveTtmCnttWorkingDays` (`ttm-policy-service.ts`).
- Kết quả gộp Epic của dự án vào **6 danh sách**: (1) Released trong giai đoạn lựa chọn, (2) Đạt
  TTM-CNTT và TTM-E2E, (3) Fail TTM-CNTT và TTM-E2E, (4) In PO (To Do, In PO), (5) Sai lệch dữ liệu
  (xem `03-mvp1-working-days-alert-rules.md` §4.5), (6) Pending.
- Mỗi dòng Epic có thể bấm mã để mở popup Duyệt Epic hoặc mở thẳng Epic trên Jira ở tab mới.

API: `GET`/`POST /api/reports` (`requireUser`, không giới hạn role thêm).

## 2. MCP Server — kết nối AI chatbot

Cho phép AI chatbot bên ngoài (Claude, ChatGPT, Gemini, Copilot...) kết nối tới TTM Monitor qua
**MCP (Model Context Protocol)**, tra cứu dữ liệu bằng hội thoại thay vì vào giao diện. Nguyên tắc
thiết kế quan trọng nhất: **mọi tool MCP gọi lại đúng service layer đang phục vụ UI**
(`getEpicAlertRowsPhased`, `getDashboardData`, `getEpicBrowserRoot`, `listProjects`, `listDomains`,
`listHolidays`, `listTtmPolicies`, `getReportLayerDates`) — không truy vấn DB riêng — nên kết quả
trả cho AI chatbot luôn tôn trọng đúng RBAC của người dùng đang kết nối, không phải một lớp quyền
song song có thể lệch pha với UI.

### 2.1. Bật/tắt & endpoint

- Bảng singleton `mcp_settings.is_enabled` — cấu hình tại modal "Quản trị hệ thống" (sidebar, chỉ
  SUPERADMIN) → tab **MCP Server**. Tắt là chặn toàn bộ truy cập MCP ngay lập tức kể cả token còn
  hiệu lực (`GET/PUT /api/admin/mcp-settings`).
- Endpoint duy nhất `POST`/`GET`/`DELETE /api/mcp` (`src/app/api/mcp/route.ts`), dựng bằng
  `WebStandardStreamableHTTPServerTransport` của `@modelcontextprotocol/sdk` — tạo `McpServer` mới
  hoàn toàn cho **mỗi HTTP request** (`buildMcpServer`, `src/lib/mcp-server.ts`), không giữ session
  giữa các lần gọi, vì hạ tầng serverless (Vercel) không giữ tiến trình sống liên tục và các request
  khác nhau có thể thuộc về user khác nhau.
- 2 endpoint `.well-known` (`/oauth-protected-resource`, `/oauth-authorization-server`) công bố
  metadata OAuth để client tự động dò cấu hình kết nối (bắt buộc theo spec MCP cho luồng OAuth).

### 2.2. Xác thực — 2 cách song song

1. **Personal Access Token (PAT)** — người dùng tự tạo tại menu avatar → "Thông tin cá nhân"
   (`PersonalAccessTokensPanel.tsx`, API `/api/mcp-tokens`), đặt tên gợi nhớ. Giá trị token thật
   (tiền tố `ttm_mcp_`) chỉ hiển thị **đúng 1 lần** lúc tạo — bảng `mcp_access_tokens` chỉ lưu bản
   băm SHA-256 (`token_hash`), không thể lấy lại giá trị gốc. Có thể thu hồi (`revoked_at`) bất kỳ
   lúc nào. Client dùng header `Authorization: Bearer <token>`.
2. **OAuth 2.0 Dynamic Client Registration + PKCE** — dành cho AI chatbot có thể tự đăng ký client
   mà không cần người dùng copy token thủ công: `/api/mcp/oauth/register` (RFC 7591) →
   `/authorize` → `/consent` → `/token`, lưu tại `mcp_oauth_clients`/`mcp_oauth_authorization_codes`.
   `mcp_oauth_authorization_codes.client_id` **không phải FK cứng** vì có thể là URL tới một Client
   ID Metadata Document thay vì một `client_id` nội bộ.

`verifyMcpAccessToken()` (`src/lib/mcp-service.ts`) resolve bearer token thành user còn active; token
không hợp lệ/đã thu hồi/user đã inactive đều trả `401` kèm header `WWW-Authenticate` trỏ tới
`oauth-protected-resource` (theo đúng spec MCP để client tự khởi động lại luồng OAuth nếu cần).

### 2.3. Danh sách tool (registerTool trong `buildMcpServer`)

| Tool | Chức năng | Giới hạn role |
|---|---|---|
| `list_epic_alerts` | Danh sách Epic + mức cảnh báo (NONE/EARLY/LATE/FAIL), lọc theo dự án/mức cảnh báo/từ khoá, tối đa 200 dòng | Theo RBAC dự án của user gọi |
| `get_epic_detail` | Chi tiết 1 Epic theo `epicKey` | Theo RBAC dự án của user gọi |
| `get_dashboard_summary` | Số liệu tổng hợp tương đương Dashboard, chọn được 1-3 `projectKeys` | Theo RBAC dự án của user gọi |
| `list_projects` | Danh mục dự án | Chỉ `ADMIN`/`SUPERVISOR`/`SUPERADMIN` |
| `list_domains` | Danh mục domain | Chỉ `ADMIN`/`SUPERVISOR`/`SUPERADMIN` |
| `list_holidays` | Danh mục ngày nghỉ, lọc theo năm | Chỉ `ADMIN`/`SUPERVISOR`/`SUPERADMIN` |
| `get_ttm_policies` | Toàn bộ tiêu chí Time to Market đang active | Chỉ `SUPERVISOR`/`SUPERADMIN` |
| `list_report_filters` | Danh mục domain/dự án/component/lớp dữ liệu — hỗ trợ hỏi sâu kiểu Báo cáo Epic | Mọi role đã xác thực |

Mỗi lần gọi tool thành công gọi `recordMcpAccessEvent(userId, tokenId)`: cộng dồn
`mcp_access_daily_stats` (theo user/ngày, tự dọn sau 90 ngày) và cập nhật `last_used_at` của token.
Tab MCP Server hiển thị lại: Token đã cấp, Lượt truy cập tuần này, Token đang active, Top 5 user
90 ngày gần nhất (`getMcpUsageSummary()`).

## 3. SSO & API Key — TTM Monitor làm SSO Provider

**Chiều ngược lại** với việc TTM Monitor tự đăng nhập qua AD Server/Keycloak (vẫn là hạng mục
roadmap tương lai — xem `01-product-overview.md`/`05-auth-rbac-user-management.md`): ở đây **TTM
Monitor cấp danh tính cho một ứng dụng nội bộ khác**, cho phép ứng dụng đó lấy hồ sơ (email, họ tên,
role) của user đang đăng nhập TTM Monitor mà không cần đăng nhập lại lần hai.

### 3.1. API Key (đóng vai trò client_id)

SUPERADMIN cấp tại modal "Quản trị hệ thống" → tab "Quản lý API key" (`ApiKeysPanel.tsx`, API
`/api/admin/api-keys`): mỗi key gồm `key_name`, `app_name`, chuỗi `api_key` UNIQUE (dùng làm
`client_id`), cờ `is_active`, cờ `is_unlimited` hoặc khoảng ngày hiệu lực `valid_from`/`valid_to`.
`validateSsoClient()` (`src/lib/sso-service.ts`) kiểm tra đủ 3 điều kiện trên trước khi cho phép
dùng key trong luồng authorize.

### 3.2. Luồng Authorization Code (hết hạn 5 phút, dùng 1 lần)

1. Ứng dụng ngoài điều hướng user tới `/sso/authorize?client_id=<api_key>&redirect_uri=<url>` (có
   thể kèm `state`) trên TTM Monitor.
2. Trang `sso/authorize` (`src/app/sso/authorize/page.tsx`) gọi `GET /api/sso/verify-client` để
   kiểm tra `client_id` hợp lệ, và `GET /api/auth/me` để biết user đã đăng nhập TTM Monitor hay
   chưa; nếu chưa đăng nhập, yêu cầu đăng nhập trước khi tiếp tục.
3. User xác nhận → `POST /api/sso/authorize` gọi `generateAuthorizationCode()`, sinh mã dùng-một-lần
   (tiền tố `ttm_ac_`, lưu vào `sso_auth_codes`, hết hạn `CURRENT_TIMESTAMP + 5 phút`), rồi điều
   hướng về đúng `redirect_uri` kèm mã này (và `state` nếu có).
4. Ứng dụng ngoài đổi mã lấy hồ sơ user bằng `POST /api/sso/token` (body `code` + `api_key`/
   `client_id`, hoặc header `X-API-Key`) → `exchangeCodeForUser()` trả `{ appName, user: { id,
   email, fullName, role } }`. Mã chỉ đổi được đúng 1 lần (`is_used`); đổi lại lần 2 trả lỗi
   `CODE_ALREADY_USED`. Các lỗi khác: `INVALID_API_KEY`, `CODE_NOT_FOUND`, `CODE_EXPIRED`,
   `USER_INACTIVE`, `CLIENT_INACTIVE`.

**Lưu ý quan trọng:** trường `accessToken` trong phản hồi `/api/sso/token` chỉ là chuỗi định danh
tham khảo (ghép `Date.now()` + user id), **không phải** một token TTM Monitor có thể xác minh lại
được sau đó — ứng dụng ngoài phải tự quản lý phiên đăng nhập riêng của họ sau khi nhận hồ sơ user,
không được dùng lại chuỗi này như một bearer token có giá trị xác thực.

Trang `/sso-demo` (kèm `POST /api/sso-demo/callback`) minh hoạ đầy đủ luồng trên từ phía một ứng
dụng khách mẫu — dùng để test cấu hình trước khi tích hợp app thật.
