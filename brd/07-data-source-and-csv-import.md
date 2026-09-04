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
→ Daily Issue Snapshot (Epic/Story/Subtask, lưu vĩnh viễn)
→ Risk calculation
```

Không ghi trực tiếp từ CSV vào bảng nghiệp vụ chính nếu chưa validate. Bước Mapping có nhiệm vụ phân giải mối quan hệ giữa Epic - Story - Subtask từ khóa chuỗi (Jira Key) thành các khóa ngoại số nguyên (`parent_id`, `epic_id`) và liên kết trực tiếp để tối ưu hóa hiệu năng truy vấn.

## 5.1. Lưu trữ dài hạn và dọn raw data

- Mỗi import thành công tạo snapshot trong `issue_daily_snapshots` cho Epic, Story và Subtask, theo `aggregated_at`; snapshot chứa các trường định danh, phân cấp, project, trạng thái, owner và các mốc ngày quan trọng. Song song còn có `epic_ttm_snapshots` — bản compact chỉ gồm Epic, cùng cơ chế `aggregated_at`.
- Snapshot là dữ liệu lịch sử vĩnh viễn, không bị xóa khi raw import bị dọn. FK tới batch dùng `ON DELETE SET NULL`. **Lưu ý:** hiện KHÔNG có màn hình sống nào (Quản trị Epic, Dashboard) đọc lại từ 2 bảng snapshot này — mọi tính toán vẫn chạy live trên `issues`; 2 bảng chỉ ghi, chờ dùng cho một lớp tổng hợp/tra cứu lịch sử trong tương lai.
- Raw data là `import_batches`, `import_rows` và `issues` của batch. Giá trị mặc định giữ raw là 30 ngày; SUPERADMIN có thể đặt từ 7 đến 3650 ngày tại Quản trị nguồn dữ liệu.
- Sau mỗi import được lưu, hệ thống dọn raw batch quá hạn trong cùng transaction; luôn giữ batch đang import và lớp `aggregated_at` mới nhất để trang Cảnh báo Epic không mất dữ liệu hiện hành.


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
> thống. Dòng vẫn được ghi vào `import_rows` với `validation_status='WARNING'` và
> `validation_errors_json` giữ nguyên message lỗi (màn "Nguồn dữ liệu" hiển thị badge "Cảnh báo" thay
> vì "Lỗi"), và **vẫn được insert vào `issues`** (`import-service.ts`'s `validIssues` chỉ loại
> `INVALID`, không loại `WARNING`).
>
> Ở tầng đọc (không phải tầng import), các Epic có 1 trong 2 vấn đề trên — hoặc thiếu hẳn Start Date
> — được đánh dấu `hasDataAnomaly = true` (`epic-alert-service.ts`): `alertLevel`/`ttmE2eAlertLevel`
> bị ép về `NONE` (tránh hiện kết quả "Đạt TTM" giả do dải ngày phi logic), cột Nhận xét hiện
> "Không tính được", và dòng bị đẩy xuống cuối bảng + highlight trên mọi màn Quản trị Epic (rút
> gọn/đầy đủ/Epic in PO). Xem chi tiết rule tính TTM tại `03-mvp1-working-days-alert-rules.md`.
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
