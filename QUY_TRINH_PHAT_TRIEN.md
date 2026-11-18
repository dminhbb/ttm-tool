# Quy trình phát triển TTM Monitor (bắt buộc)

Mọi yêu cầu thay đổi tool TTM (tính năng mới, sửa lỗi, đổi rule, đổi cấu hình, đổi schema) phải đi đủ
9 bước dưới đây, theo đúng thứ tự. Quy định này áp dụng cho mọi người và mọi agent làm việc trên repo
(Claude Code, Codex, Cursor, Kiro, người làm tay...).

```text
1. Rà soát → 2. Phân tích → 3. Cập nhật traceability → 4. Chỉnh sửa contract (nếu có)
→ 5. Code → 6. Unit test → 7. Test thông luồng → 8. Run local → 9. Đẩy GitLab
```

Quy tắc chung:

- Chưa xong bước trước thì không làm bước sau. Nếu bước sau phát hiện sai ở bước trước, quay lại bước đó
  và cập nhật lại kết quả của nó (đặc biệt là traceability).
- Một bước được bỏ qua chỉ khi ghi rõ `N/A` kèm lý do trong traceability (ví dụ "không đổi API/schema" ở bước 4).
- Mỗi bước phải để lại bằng chứng (file, lệnh đã chạy, kết quả). Không có bằng chứng thì coi như chưa làm.
- Agent phải dừng và hỏi chủ sản phẩm khi: yêu cầu mơ hồ, thay đổi chạm dữ liệu thật trên UAT (xoá, migrate,
  import lại), hoặc phát hiện phạm vi thực tế khác với yêu cầu ban đầu.
- Các quy định sẵn có trong `AGENTS.md` (version stamp, daily change log, Scoring Service, icon, lịch sử
  `issues`...) vẫn giữ nguyên hiệu lực. File này quy định thứ tự làm việc; `AGENTS.md` quy định cách làm từng phần.

---

## Bước 1. Rà soát

Mục tiêu: biết chính xác hệ thống hiện đang làm gì ở chỗ cần sửa, trước khi nghĩ cách sửa.

Việc cần làm:

- Đọc `docs/kb/INDEX.md` trước, mở card của chức năng cần sửa trong `docs/kb/features/`. Card chỉ ra file, bảng, API,
  test và phụ thuộc chéo: chỉ đọc source ở những chỗ đó, không đọc lại toàn bộ repo. Chức năng chưa có card thì rà
  soát như các gạch đầu dòng dưới đây rồi viết card mới theo `docs/kb/features/_TEMPLATE.md`.
- Đọc `BRD_INDEX_FOR_AI_AGENT.md` để chọn đúng file BRD trong `brd/`, rồi đọc file đó và các spec liên quan
  trong `docs/superpowers/specs/`, `docs/`.
- Tìm mọi nơi liên quan trong toàn bộ hệ thống, không chỉ một màn hình: UI (`src/app`, `src/components`),
  service (`src/lib`, `src/modules`), API (`src/app/api`), DB (`db/migrations`), script (`scripts/`),
  cấu hình triển khai (`.gitlab-ci.yml`, `openshift/`, `Dockerfile`) và nguồn dữ liệu bên ngoài
  (Jira crawl tool, file CSV import, xem `docs/jira-crawl-tool-guide.html`).
- Xác định dữ liệu đi qua những chặng nào: nguồn → import adapter → `issues` → Scoring Service → cache → API → UI.
- Đọc mục ngày gần nhất trong `daily_change_log.md` và `git log` của các file liên quan.

Kết quả: danh sách thành phần bị ảnh hưởng (đường dẫn file, bảng DB, API, hệ thống ngoài) và hiện trạng của từng thành phần.

## Bước 2. Phân tích

Mục tiêu: chốt cách sửa và phạm vi trước khi đụng vào code.

Việc cần làm:

- Viết lại yêu cầu thành tiêu chí nghiệm thu đo được (Given/When/Then hoặc danh sách kiểm tra).
- Nếu có hơn một cách làm, so sánh theo độ đúng, độ đơn giản, khả năng rollback, ảnh hưởng dữ liệu cũ; chọn một và ghi lý do.
- Đánh giá tác động: dữ liệu đã có trong DB, cache cần tạo lại, phân quyền (RBAC), hiệu năng, an toàn thông tin.
- Ghi rõ những gì KHÔNG làm trong lần này (ngoài phạm vi).
- Thay đổi lớn (nhiều module, đổi rule scoring, đổi schema) phải có spec trong `docs/superpowers/specs/`.

Kết quả: tiêu chí nghiệm thu, phương án đã chọn, danh sách rủi ro. Được chủ sản phẩm xác nhận nếu phạm vi thay đổi so với yêu cầu.

## Bước 3. Cập nhật traceability

Mục tiêu: mỗi yêu cầu nối được tới BRD, contract, code, test và commit.

Việc cần làm:

- Thêm một dòng vào `docs/traceability/TRACEABILITY.md` với mã yêu cầu `REQ-yyyymmdd-nn`.
- Điền nguồn yêu cầu (người yêu cầu, ngày), mục BRD/spec liên quan, tiêu chí nghiệm thu, các thành phần bị ảnh hưởng.
- Các cột contract, code, test, commit để trạng thái `Đang làm` và điền dần ở các bước sau.
- Nếu yêu cầu làm BRD lỗi thời, cập nhật file BRD tương ứng trong `brd/` ngay ở bước này.

Kết quả: dòng traceability ở trạng thái `Đã phân tích`.

## Bước 4. Chỉnh sửa contract (nếu có)

Contract là mọi giao diện mà phía khác đang dựa vào. Với repo này gồm:

| Loại contract | Vị trí |
|---|---|
| API HTTP (request, response, mã lỗi, quyền) | `src/app/api/**/route.ts` và type dùng chung `src/lib/*-types.ts` |
| Schema DB | `db/migrations/*.sql` (kèm file `.down.sql`), `db/install/ttm-monitor-schema.sql`, `docs/database-erd.md` |
| Định dạng dữ liệu import (CSV Pure Jira Export, Py Jira API từ crawl tool) | `src/lib/adapters/*`, `src/lib/import-admission-rules.ts` |
| Rule và badge của Scoring Service | `src/lib/scoring/catalog.ts`, `registry.ts`, `SCORING_CODE_VERSION` |
| MCP tool | `src/lib/mcp-server.ts`, `src/lib/mcp-types.ts` |
| Ranh giới module | `src/modules/*/public.ts` |

Việc cần làm:

- Sửa contract trước khi sửa phần cài đặt. Ưu tiên thay đổi tương thích ngược (thêm trường, không đổi nghĩa trường cũ).
- Thay đổi không tương thích phải liệt kê bên bị ảnh hưởng (màn hình, crawl tool, MCP client) và cách chuyển đổi.
- Migration mới phải chạy lại được nhiều lần (`IF NOT EXISTS`) và có file rollback `.down.sql`.
- Không có contract nào đổi thì ghi `N/A – không đổi contract` vào traceability.

Kết quả: contract đã cập nhật, ghi vào cột Contract của traceability.

## Bước 5. Code

Việc cần làm:

- Tuân theo `CODING_STANDARD_AI.md`, `AGENTS.md`, `DESIGN.md` / `design-system-spec.md` (khi sửa UI).
- Chỉ sửa trong phạm vi đã chốt ở bước 2. Không refactor ngoài phạm vi; muốn refactor thì tách yêu cầu riêng.
- Không đưa secret, dữ liệu thật hay file dữ liệu (CSV export, file map key) vào repo.
- Code chết sau khi bỏ một chức năng phải được xoá cùng lúc (code, cấu hình, tài liệu nhắc tới nó).
- Đổi file chính, bảng DB, API hay contract của một chức năng thì sửa card của chức năng đó trong `docs/kb/features/`
  ngay trong cùng thay đổi (kể cả mục "Bẫy đã biết" nếu vừa gặp một bẫy mới).
- `npm run lint` không có lỗi.

Kết quả: danh sách file đã sửa, ghi vào cột Code của traceability.

## Bước 6. Unit test

Việc cần làm:

- Mỗi tiêu chí nghiệm thu có ít nhất một test. Sửa lỗi thì phải có test tái hiện lỗi đó (fail trước khi sửa, pass sau khi sửa).
- Test đặt cạnh code theo quy ước `src/**/__tests__/*.test.ts`.
- Chạy toàn bộ: `npm test`. Không được tắt, skip hay nới test cũ cho qua; nếu test cũ sai theo yêu cầu mới thì sửa và ghi lý do.
- Đổi rule scoring thì tăng `SCORING_CODE_VERSION` (theo `AGENTS.md`).

Kết quả: `npm test` và `npm run lint` đều pass, ghi tên test vào cột Unit test của traceability.

## Bước 7. Test thông luồng

Mục tiêu: kiểm tra cả chặng dữ liệu đã xác định ở bước 1, từ đầu vào tới màn hình, trên máy local (`npm run dev`).

Việc cần làm:

- Trên **máy công ty (`ttm-tool-mb`)**: `.env.local` trỏ vào DB server UAT (xem mục "Two environments" trong `AGENTS.md`), nên mọi thao tác ghi trong bước này (migration `npm run db:migrate:local`, import, xoá, tạo lại cache) là ghi lên dữ liệu UAT thật — phải được chủ sản phẩm đồng ý trước, và migration phải có `.down.sql` để rollback.
- Trên **máy cá nhân (`ttm-tool`)**: chạy migration trên cả hai CSDL (`npm run db:migrate:local` và `npm run db:migrate:supabase`) và sinh lại schema bằng `npm run db:export-schema -- --target=supabase` theo `AGENTS.md`.
- Đi hết luồng nghiệp vụ: nhập dữ liệu (import CSV hoặc dữ liệu crawl) → tạo lại cache nếu cần → gọi API → xem trên màn hình.
- Kiểm tra theo từng vai trò bị ảnh hưởng (SUPERADMIN, ADMIN, PM/SM, user thường) và các màn hình dùng chung dữ liệu
  (`/epic-alerts-15`, `/data-normalization`, `/reports`, TTM Dashboard 2...).
- Kiểm tra các trường hợp biên: không có dữ liệu, dữ liệu lỗi, không có quyền.
- Ghi lại kịch bản đã chạy và kết quả (ảnh chụp hoặc output API).

Kết quả: kịch bản và kết quả ghi vào cột Test thông luồng của traceability.

## Bước 8. Run local

Mục tiêu: chắc chắn bản build production chạy được giống như trên OCP, không chỉ chạy ở chế độ dev.

Việc cần làm:

- `npm run build` thành công, không lỗi type.
- `npm start`, mở trang đăng nhập, kiểm tra build stamp ở footer, đi nhanh lại các màn hình đã sửa.
- Cập nhật `version.json` (`"build": "yymmdd.hhmm"`) và thêm mục vào `daily_change_log.md` theo `AGENTS.md`.

Kết quả: build pass, smoke test pass.

## Bước 9. Đẩy GitLab / GitHub

Việc cần làm:

- `git status` sạch những file không thuộc yêu cầu. Kiểm tra lại không có `.env*`, CSV, file map key, địa chỉ nội bộ hay secret trong diff.
- Commit theo dạng `type(scope): mô tả` (ví dụ `fix(import): ...`, `feat(epic-alerts): ...`), nhắc mã `REQ-...` trong nội dung commit.
- Agent phải hỏi chủ sản phẩm trước khi push:
  - **Máy cá nhân (`ttm-tool`)**: push lên nhánh `main` của GitHub (`dminhbb/ttm-tool` → Vercel production).
  - **Máy công ty (`ttm-tool-mb`)**: push lên nhánh `uat` của `origin` (GitLab nội bộ). Pipeline chính thức là `.gitlab-ci.yml` (deploy bằng `oc` lên OpenShift, có chạy migration): theo dõi pipeline GitLab (`install → verify (lint, test) → build-image`) tới khi xanh; deploy lên OpenShift UAT chạy tay do chủ sản phẩm bấm (`migrate-uat` rồi `deploy-uat`).
- Sau khi deploy, mở địa chỉ môi trường đích (`<UAT_APP_URL>` hoặc production), kiểm tra build stamp ở footer khớp `version.json`
  vừa push, rồi kiểm tra lại các tiêu chí nghiệm thu.

Kết quả: điền commit, pipeline, trạng thái `Đã push` / `Đã deploy UAT` vào traceability.

---

## Checklist trước khi báo "xong"

- [ ] Có dòng traceability đầy đủ, mọi cột đã điền hoặc ghi `N/A` kèm lý do.
- [ ] Contract, BRD và card knowledge base (`docs/kb/`) khớp với code.
- [ ] `npm run lint`, `npm test`, `npm run build` đều pass.
- [ ] Đã chạy test thông luồng và có ghi lại kết quả.
- [ ] Migration (nếu có) có `.down.sql`, đã chạy lên DB (`local` + `supabase` trên máy cá nhân, hoặc DB UAT trên máy công ty khi được đồng ý), và đã sinh lại schema (`npm run db:export-schema -- --target=supabase` trên máy cá nhân, hoặc `--target=local` trên máy công ty).
- [ ] `version.json` và `daily_change_log.md` đã cập nhật.
- [ ] Đã push, pipeline xanh (khi được chủ sản phẩm yêu cầu push).
