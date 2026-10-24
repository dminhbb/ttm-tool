# 07 — Data Source and CSV Import

## 1. Nguyên tắc nguồn dữ liệu

Ban đầu ứng dụng chưa kết nối Jira trực tiếp.

MVP đầu sử dụng **import file CSV** làm nguồn dữ liệu.

Thiết kế phải module hóa để sau này thay được bằng:

- Query trực tiếp Jira Database.
- Job call Jira REST API.
- Webhook hoặc cơ chế đồng bộ khác.

## 2. Data Source Adapter

Nguồn dữ liệu phải được thiết kế dạng adapter.

Interface đề xuất:

```ts
interface DataSourceAdapter {
  getSourceType(): DataSourceType;
  validateConnection?(): Promise<ValidationResult>;
  fetchEpics(params: FetchParams): Promise<RawEpic[]>;
  fetchStories?(params: FetchParams): Promise<RawStory[]>;
  fetchSubtasks?(params: FetchParams): Promise<RawSubtask[]>;
}
```

MVP đầu dùng:

```text
CsvDataSourceAdapter
```

Các adapter sau:

```text
JiraApiDataSourceAdapter
JiraDbQueryDataSourceAdapter
```

> **Lưu ý tên gọi:** adapter hiện có tên `src/lib/adapters/py-jira-api-adapter.ts` — tên này dễ gây
> hiểu nhầm là gọi Jira REST API trực tiếp. Thực tế nó **vẫn chỉ đọc file CSV** (do một script Python
> chạy ngoài, tự gọi Jira REST API rồi xuất ra CSV theo cấu trúc phẳng), không phải một
> `JiraApiDataSourceAdapter` thật sự theo interface `fetchEpics()` ở trên. `JiraApiDataSourceAdapter`/
> `JiraDbQueryDataSourceAdapter` (gọi sống tới Jira, không qua file trung gian) vẫn là roadmap tương
> lai, chưa triển khai.

Cột `main_fail_dept` ở dòng Epic (bổ sung 2026-10-14, không có tiền tố `epic_`; adapter Pure Jira Export nhận
`main_fail_dept` / `epic_main_fail_dept` / "Phòng chịu trách nhiệm chính") — "Phòng chịu trách nhiệm chính" của Epic
Fail TTM → `issues.main_fail_dept`. Hiển thị ở Duyệt Epic → Giải trình Fail TTM; Scoring Service cảnh báo
`REC_MISSING_RESPONSIBLE_DEPARTMENT` khi Epic Fail có R4G Date muộn hơn Target mà trường này trống hoặc "None".

Adapter Py Jira API nhận thêm 2 cột **tùy chọn** ở dòng Epic (bổ sung 2026-10-14), chỉ dùng cho rule
Từ chối import (§2.2) — file không có 2 cột này vẫn import bình thường:

- `epic_issue_type` — issue type gốc trên Jira của issue cấp 1 (`Epic`, `CTNB`, `YCPT`…). Dòng vẫn được
  coi là Epic về phân cấp (`issueType = 'Epic'`); giá trị gốc nằm ở `sourceIssueType`.
- `epic_status_changed_at` — ngày Epic chuyển sang status hiện tại (lấy từ changelog Jira).

## 2.2. Từ chối import — phạm vi dữ liệu nguồn (2026-10-14)

Crawl tool chưa lọc được ngay từ nguồn, nên import adapter tự giữ phạm vi dữ liệu:
`created >= 31/01/2026`, Epic Released / MVP Done chỉ khi chuyển sang status đó **sau 30/06/2026**, và
issue cấp 1 chỉ nhận issue type **Epic**. Bước này chạy trong `processImport` ngay sau khi parse CSV,
trước validate — dòng bị từ chối không đi vào bất kỳ bảng nào; số dòng/Epic bị
từ chối ghi ở `import_batches.metadata_json` (`deniedRows`, `deniedEpics`) và cột "Từ chối" của Nhật ký
lịch sử import. Áp dụng cho cả form thủ công lẫn `POST /api/data-source/import/auto`.

| Trường hợp | Xử lý |
|---|---|
| Epic có trong `denied_import_epics` (`allow_import = FALSE`) | Luôn từ chối, kèm mọi Story của Epic và mọi Subtask (gắn thẳng vào Epic hoặc thuộc Story của nó). |
| Epic có trong danh sách với `allow_import = TRUE` ("Cho phép import") | Import bình thường, **miễn trừ** rule tự động. |
| Epic chưa có trong danh sách, vi phạm rule tự động | Từ chối, tự thêm vào danh sách (`source = 'AUTO_RULE'`, kèm lý do). Dữ liệu cũ (nếu có) bị xoá bằng Epic deletion cùng transaction **chỉ khi** là upload thủ công (đã qua hộp xác nhận) và không quá `MAX_EPIC_DELETIONS_PER_IMPORT` = 25 Epic còn dữ liệu; import tự động (`importType = 'AUTO'`) hoặc quá 25 Epic thì **giữ dữ liệu** để SUPERADMIN kiểm tra rồi dùng "Xóa dữ liệu còn tồn tại" (từ 2026-10-19). Kết quả ghi ở `metadata_json.deniedDataOutcome`. |
| Epic chưa có trong danh sách, chỉ được nhận nhờ ngoại lệ của rule B | Import bình thường và **tự thêm vào danh sách** với `allow_import = TRUE`, `source = 'AUTO_EXEMPT'`, lý do ghi ngày làm bằng chứng — để vẫn được miễn khi bằng chứng (`issues` theo thời hạn lưu trữ, snapshot khi "Xóa lớp dữ liệu") đã bị xoá (từ 2026-10-19). Không ghi đè Epic đã có trong danh sách. Từ 2026-10-20 dòng `AUTO_EXEMPT` **chỉ miễn rule B**: rule A và rule loại issue vẫn xét ở mỗi lần import (dời mốc A qua ngày tạo thì Epic vẫn bị từ chối — dòng chuyển sang `AUTO_RULE`); "Cho phép import" do admin bật (MANUAL / SEED / AUTO_RULE, hoặc bật lại một dòng AUTO_EXEMPT đã tắt → MANUAL) mới miễn mọi rule. |

Rule tự động (`src/lib/import-admission-rules.ts`, thuần, có unit test). Ngày A/B lưu ở
`import_admission_settings`, chỉnh ở tab "Từ chối import" (nhãn "Ngày Created >=" = A, "Ngày Due Date >=" = B); để trống = tắt rule.
Ngày A/B **không được sau hôm nay** (API `PUT /settings` trả 400 — từ 2026-10-19), vì ngày ở tương lai sẽ
từ chối cả các Epic đang trong phạm vi:

- **Loại issue** — issue cấp 1 có issue type khác Epic (`epic_issue_type` với Py Jira API; cột Issue Type với Pure Jira Export).
- **A** — `created < A` (mặc định 2026-01-31), theo ngày Việt Nam.
- **B** — status Released / MVP Done **và** ngày chuyển status `< B` (mặc định 2026-07-01). Ngày chuyển
  status = `epic_status_changed_at` nếu có; chưa có thì dùng Due Date, Due trống thì dùng R4G Date.
  **Ngoại lệ:** Epic mà CSDL đã ghi nhận ở status khác Released / MVP Done vào/sau ngày B (`issues`) chắc chắn chuyển sang Released sau B → không bị rule B từ chối (ví dụ DL-65580:
  due 25/06 nhưng Released 10/09).

Rule đặt ngoài Scoring Service (`src/lib/scoring/`) có chủ đích (quyết định owner 2026-10-14): đây là
cổng chặn dữ liệu đầu vào, không phải badge/verdict hiển thị trên màn hình.

**Epic deletion** (`src/lib/epic-deletion-service.ts`) — xóa vĩnh viễn các Epic:

- Phạm vi issue: Epic + Story có `epic_key` = Epic + Subtask có `epic_key` = Epic + Subtask có
  `parent_key` = key hoặc jira_id của các Story đó, xác định theo **trạng thái mới nhất** của từng issue
  (từ `issues`); issue đã chuyển sang Epic khác được giữ nguyên. Từ 2026-10-19
  truy vấn chỉ đọc các issue từng trỏ tới Epic / Story đó (index `20261019c_add_epic_deletion_scope_indexes.sql`)
  thay vì tính trạng thái mới nhất của mọi issue — kết quả giữ nguyên (đã đối chiếu 385 Epic trên DB local).
- Xóa ở: `issues` (mọi batch),
  `epic_alert_timeline`,
  `epic_alert_row_cache`, `black_listed_epics`; ghi `audit_logs` (`EPIC_DELETION`) cho từng Epic.
- **Không chạy lại cache** — `ttm_index_global_cache` / `ttm_dashboard_2_cache` vẫn tính Epic đã xóa cho
  tới khi admin chạy lại cache thủ công (UI hiện toast nhắc).
- API (SUPERADMIN): `GET /api/data-source/epic-deletion?keys=` (xem trước), `POST /api/data-source/epic-deletion`.

Tab "Từ chối import" (Quản trị nguồn dữ liệu, tab thứ 3 cạnh "Quản lý Component", SUPERADMIN) — API dưới `/api/data-source/denied-import`:
`GET` (danh sách + A/B), `POST` (thêm + xóa dữ liệu, sau popup xem trước), `PATCH` (sửa "Cho phép import";
tắt = từ chối lại + xóa dữ liệu), `DELETE` (xóa / xóa theo lô khỏi danh sách), `PUT /settings` (A/B),
`GET|POST /scan` (Quét lại CSDL theo rule), `POST /purge` (Xóa dữ liệu còn tồn tại).

Bỏ Epic khỏi danh sách không làm dữ liệu quay lại: import hằng ngày chỉ chứa issue được cập nhật trong
ngày. Epic còn vi phạm rule A/B sẽ bị từ chối lại ở lần import sau — muốn giữ, bật "Cho phép import".

## 2.1. Duyệt dữ liệu của một lớp import

Từ mỗi record trong nhật ký import, action `Duyệt dữ liệu` mở `/data-review/[batchId]` và chỉ đọc dữ liệu thuộc batch đó.

- Bảng phân cấp `Epic → Story → Subtask`; page ban đầu trả tối đa 10 Epic, tất cả đóng.
- Mở thêm Epic không đóng Epic trước đó. Story và Subtask chỉ tải khi người dùng mở nhánh nhằm giữ tải trang nhẹ.
- Bảng có các cột: Project, ID, Issue type, Key, Status, Start date, R4G date, Due date, Summary, Assignee.
- Filter Project, Status và Component/s lấy option từ dữ liệu đã import. Component/s bị giới hạn theo Project được chọn; khi chưa chọn Project, filter Component/s bị disable.
- Filter Issue type giữ ngữ cảnh Epic trong cây: khi chọn Story hoặc Subtask, màn hình trả các Epic có nhánh chứa loại issue đó.
- Sau mỗi import thành công, hệ thống upsert các cặp `project_key`/`component_name` vào catalog `project_components`. Các component không còn xuất hiện trong batch mới không bị xóa; component mới được thêm và duplicate bị loại bằng unique key. Dropdown chỉ dùng component có trạng thái `active` của Project đang chọn. Ngoài catalog này, `issues.components TEXT[]` lưu Component/s thật của TỪNG Epic/Story — đây là cơ chế khác, dùng để lọc/giới hạn Epic theo Component ở phân quyền PM/SM (xem `05-auth-rbac-user-management.md` §12b), không phải chỉ để đổ dropdown filter.
- API đọc dữ liệu phải parameterize `batchId`, page, filter và parent id; không được ghép trực tiếp input người dùng vào SQL.

## 3. CSV Import trong MVP đầu

Màn hình Nguồn dữ liệu cần hỗ trợ:

- Chọn source type CSV Import.
- Upload file CSV.
- Chọn mapping profile.
- Validate only (chỉ kiểm tra lỗi và hiển thị xem trước - preview trên UI, hoàn toàn không ghi nhận dữ liệu vào CSDL).
- Import and validate.
- Xem kết quả validate.
- Xem lịch sử import.
- Tải file mẫu CSV.

## 4. Import tự động một lần mỗi ngày

Tạm thời ứng dụng cho phép chạy tự động duy nhất 1 lần trong ngày khi CBQL Phòng đăng nhập vào ứng dụng.

Quy tắc:

```text
Nếu user role = CBQL Phòng
AND hôm nay chưa có import tự động thành công
AND có CSV source đã cấu hình
THEN chạy import tự động
```

Nếu trong ngày đã chạy import tự động thì không chạy lại.

Sau này chức năng này sẽ được thay bằng job chạy tự động theo lịch.

## 5. Staging và canonical data

Import CSV nên đi qua các bước:

```text
CSV file
→ Raw import rows
→ Validate
→ Staging
→ Mapping & Link Resolution (Phân giải parent_id, epic_id)
→ Canonical Unified Issues Table (Bảng issues gộp duy nhất)
→ Lịch sử cảnh báo / timeline / vi phạm sai lệch (aggregateBatchData)
→ Risk calculation
```

Không ghi trực tiếp từ CSV vào bảng nghiệp vụ chính nếu chưa validate. Bước Mapping có nhiệm vụ phân giải mối quan hệ giữa Epic - Story - Subtask từ khóa chuỗi (Jira Key) thành các khóa ngoại số nguyên (`parent_id`, `epic_id`) và liên kết trực tiếp để tối ưu hóa hiệu năng truy vấn.

## 5.1. Lưu trữ dài hạn và dọn raw data

- Từ 2026-10-23 hai bảng snapshot `issue_daily_snapshots` / `epic_ttm_snapshots` đã được **gỡ** (chúng chỉ là bản sao từng dòng của `issues`, không màn hình nào đọc). Lịch sử Issue (lớp dữ liệu cũ, bằng chứng rule B, phạm vi Epic deletion) chỉ còn trong `issues` và mất theo retention RAW. Dòng thời gian cảnh báo (`epic_alert_timeline`; `epic_alert_history` đã gộp vào đây 2026-10-24) vẫn sống sau khi raw bị dọn (FK `ON DELETE SET NULL`).
- Raw data là `import_batches` và `issues` của batch (các bảng `import_rows` và `import_row_issues` đã gỡ 2026-10-24; chi tiết lỗi/cảnh báo từng dòng chỉ còn trong phản hồi upload). Giá trị mặc định giữ raw là 30 ngày; SUPERADMIN có thể đặt từ 7 đến 3650 ngày tại Quản trị nguồn dữ liệu.
- Retention của `issues` do job dọn dẹp hằng ngày thực hiện (không còn xóa trong transaction import): xem `brd/08-data-model.md` §19 — giữ mọi phiên bản của 30 ngày import gần nhất, xa hơn chỉ giữ phiên bản có hiệu lực vào ngày làm việc cuối mỗi tuần và phiên bản mới nhất của mỗi issue, nên trang Cảnh báo Epic không bao giờ mất Epic hiện hành. Nút "Duyệt dữ liệu" của một đợt import chỉ mở được với 30 ngày import gần nhất.


## 6. Import log

Mỗi lần import cần lưu:

- Batch ID.
- Source type.
- File name.
- Imported by.
- Imported at.
- Total rows.
- Success rows.
- Error rows.
- Warning rows.
- Status.
- Error detail.

## 7. Validation

Các lỗi validate cần phát hiện (`src/lib/validator.ts`):

- Thiếu Epic Key.
- Thiếu Epic Name.
- Thiếu Current Status.
- Ngày không đúng định dạng.
- Start Date trước T0 (Idea Approved Date) — mức **WARNING**, không chặn import.
- Loại Epic không xác định.
- Project chưa mapping với domain.
- User/owner chưa tồn tại, nếu cần strict mode.

> **Cập nhật quan trọng:** 2 rule dưới đây trước kia là **ERROR** (chặn hoàn toàn, dòng bị loại khỏi
> `issues`), nay đã hạ xuống **WARNING** và **không còn chặn import**:
>
> - **R4G Date trước Start Date.**
> - **Due Date trước T0 (Idea Approved Date).**
>
> Lý do: các Epic có dữ liệu ngày phi logic này vẫn cần xuất hiện trên các màn hình Quản trị Epic để
> user chủ động nhận biết và làm sạch dữ liệu nguồn trên Jira, thay vì bị âm thầm loại bỏ khỏi hệ
> thống. Dòng được tính là cảnh báo (`import_batches.warning_rows`; phản hồi upload liệt kê message lỗi) và
> **vẫn được insert vào `issues`** (`import-service.ts`'s `validIssues` chỉ loại
> `INVALID`, không loại `WARNING`).
>
> Ở tầng đọc (không phải tầng import), các Epic có 1 trong 2 vấn đề trên — hoặc thiếu hẳn Start Date
> — luôn được đánh dấu `hasDataAnomaly = true` (một trong 6 rule "Sai lệch dữ liệu", xem mục 4.5 của
> `03-mvp1-working-days-alert-rules.md`) và hiện badge "Sai lệch dữ liệu" + đẩy xuống cuối bảng +
> highlight trên mọi màn Quản trị Epic (rút gọn/đầy đủ/Epic in PO). Riêng việc ép `alertLevel`/
> `ttmE2eAlertLevel` về `NONE` ("Không tính được") dùng 2 điều kiện **hẹp hơn** —
> `breaksTtmCnttCalculation`/`breaksTtmE2eCalculation` (`epic-data-anomaly.ts`) — chỉ đúng khi bản
> thân phép tính TTM-CNTT/TTM-E2E không còn đáng tin (thiếu Start Date, hoặc R4G/Due Date phi logic
> so với mốc gốc); một Epic chỉ thiếu Requirement Level hoặc T0 (không thuộc 2 điều kiện trên) vẫn
> hiện đúng Cảnh báo sớm/muộn/Fail bình thường song song với badge "Sai lệch dữ liệu".
>
> Dữ liệu đã bị loại bởi 2 rule này TRƯỚC khi hạ xuống WARNING sẽ không tự xuất hiện lại — phải
> import lại đúng file CSV gốc.

## 8. Acceptance Criteria

```gherkin
Given CBQL Phòng đăng nhập lần đầu trong ngày
And source CSV đã cấu hình
When hệ thống kiểm tra import log
Then hệ thống chạy import tự động nếu hôm nay chưa chạy
```

```gherkin
Given trong ngày đã có import tự động thành công
When CBQL Phòng đăng nhập lại
Then hệ thống không chạy import tự động lần nữa
```

```gherkin
Given source adapter là CSV
When sau này thay bằng Jira API adapter
Then các module dashboard và alert không cần thay đổi logic nghiệp vụ
```
