# 02 — TTM Concepts and Rules

## 1. Hai tiêu chí Time to Market

Hệ thống theo dõi hai tiêu chí:

| Tiêu chí | Ý nghĩa | Trọng tâm MVP1 |
|---|---|---|
| TTM-CNTT | Thời gian xử lý trong phạm vi CNTT | Có |
| TTM-E2E | Toàn bộ hành trình từ duyệt ý tưởng tới Released | Chưa phải trọng tâm MVP1 (nhưng đã có cảnh báo Fail riêng, xem cập nhật bên dưới) |

> **Cập nhật:** TTM-E2E hiện có cảnh báo **Fail TTM-E2E** độc lập với Fail TTM-CNTT, không chỉ là
> con số tham chiếu như dự kiến ban đầu — xem rule `E2E_FAIL` của Scoring Service (`src/lib/scoring/rules/ttm-e2e.ts`)
> và mục 5 bên dưới. T0 (Idea Approved Date) nếu thiếu sẽ tự fallback sang ngày tạo Epic trên Jira
> (`jira_created_at`, luôn có), nên baseline TTM-E2E luôn tính được kể cả khi Epic thiếu Start Date.

## 2. Phân loại Epic (epic-type)

> **Cập nhật (11/2026):** thay cho lược đồ 2 loại cũ (Epic đơn giản/Epic phức tạp = SIMPLE/COMPLEX), hệ
> thống hiện phân loại Epic theo **14 giá trị** tính từ hai trường Jira — `epic_request_type` (Loại yêu
> cầu) và `epic_request_level` (Mức yêu cầu, 1-4) — theo `computeEpicComplexity`
> (`src/lib/epic-complexity.ts`), tính một lần tại thời điểm import.
>
> **Quyết định 2026-11-23 (chủ sản phẩm), bổ sung 2026-11-24:** "Loại yêu cầu" được tách thành **7 loại**
> (Cải tiến, Tính năng mới, Sản phẩm, Hệ thống mới, Quy trình, Dịch vụ, Giải pháp nền tảng). CT và TNM
> hợp lệ ở cả mức 1-2 lẫn 3-4; các loại còn lại (SP/HTM/QT/DV/GPNT) **chỉ tồn tại ở mức 3-4**, nên tổ
> hợp mức 1-2 của chúng là **"Phân loại sai Epic"** — vẫn lưu để Scoring Service rule R6 gắn cờ.
>
> Chuỗi `epic_request_type` được chuẩn hoá trước khi so khớp (lowercase + trim + gom khoảng trắng + NFC,
> chấp nhận dấu tiếng Việt dạng NFD/tách rời). Level ∈ {1,2} → `Lv12`, level ∈ {3,4} → `Lv34`; level
> ngoài 1-4 hoặc thiếu → `Lv12`; Loại yêu cầu thiếu/rỗng/`none` → `CT` (mặc định an toàn). Từ đồng
> nghĩa/legacy → SP: `Sản phẩm/dịch vụ/quy trình mới`, `Sản phẩm mới`, `Phát triển mới`.
>
> **Loại yêu cầu cũ kèm Level trống** (chủ sản phẩm 26/11/2026): "Sản phẩm/dịch vụ/quy trình mới" / "Sản phẩm mới" / "Phát triển mới" mà Level trống (hoặc ngoài 1-4) → `SP-Lv12` = **"Phân loại sai Epic"**, bị rule R6 loại khỏi việc chấm Đạt / Fail; migration `20261205_align_epic_complexity_with_code` tính lại toàn bộ `issues.epic_complexity_type` đúng như `computeEpicComplexity` (cùng cách chuẩn hoá), nên dữ liệu cũ và dữ liệu import mới không còn lệch.

**9 tổ hợp hợp lệ:**

| Epic-type | Điều kiện (request type × request level) |
|---|---|
| `CT-Lv12` | Loại yêu cầu = "Cải tiến" hoặc rỗng/None/không nhận ra + mức 1-2 (hoặc mức trống) — **mặc định** khi dữ liệu thiếu hoặc không khớp bất kỳ điều kiện nào khác |
| `CT-Lv34` | Loại yêu cầu = "Cải tiến" hoặc rỗng/None/không nhận ra + mức 3-4 |
| `TNM-Lv12` | Loại yêu cầu = "Tính năng mới" + mức 1-2 (**hợp lệ từ 23/11/2026**) |
| `TNM-Lv34` | Loại yêu cầu = "Tính năng mới" + mức 3-4 |
| `HTM-Lv34` | Loại yêu cầu = "Hệ thống mới" + mức 3-4 |
| `SP-Lv34` | Loại yêu cầu = "Sản phẩm" (hoặc cụm legacy → SP) + mức 3-4 |
| `QT-Lv34` | Loại yêu cầu = "Quy trình" + mức 3-4 |
| `DV-Lv34` | Loại yêu cầu = "Dịch vụ" + mức 3-4 |
| `GPNT-Lv34` | Loại yêu cầu = "Giải pháp nền tảng" + mức 3-4 |

**5 tổ hợp "Phân loại sai Epic"** (loại SP/HTM/QT/DV/GPNT ở mức 1-2 — bị R6 gắn cờ, xem
`03-mvp1-working-days-alert-rules.md` §4.5): `HTM-Lv12`, `SP-Lv12`, `QT-Lv12`, `DV-Lv12`, `GPNT-Lv12`.

Giá trị số ngày làm việc (working days) hiện đang cấu hình cho từng loại (bảng `ttm_policy_configs`,
panel "Tiêu chí Time to Market" tại "Cấu hình cảnh báo") — **9 tổ hợp hợp lệ được seed sẵn** (migration
`20261202_seed_epic_complexity_valid_combos.sql`):

| Epic-type | TTM-CNTT (Start Date → R4G Date) | TTM-E2E (T0 → R4G Date, xem cập nhật 24/09/2026 mục 6) |
|---|---:|---:|
| CT-Lv12 | 15 ngày làm việc | 20 ngày làm việc |
| CT-Lv34 | 25 ngày làm việc | 30 ngày làm việc |
| SP-Lv12 (nhóm sai) | 30 ngày làm việc | 50 ngày làm việc |
| SP-Lv34 | 30 ngày làm việc | 50 ngày làm việc |
| TNM-Lv12 (copy SP-Lv12) | 15 ngày làm việc | 50 ngày làm việc |
| TNM-Lv34 / HTM-Lv34 / QT-Lv34 / DV-Lv34 / GPNT-Lv34 (copy SP-Lv34) | 30 ngày làm việc | 50 ngày làm việc |

Các giá trị trên do CBQL Phòng tự cấu hình và có thể thay đổi bất kỳ lúc nào tại panel "Tiêu chí Time
to Market" — bảng trên chỉ là giá trị đang active tại thời điểm cập nhật tài liệu này, không phải hằng
số cứng trong code. Đây là nguồn DUY NHẤT cho mốc hạn TTM — không còn cột `fail_offset_days` trên
`epic_status_alert_rules` (đã bị drop, xem `03-mvp1-working-days-alert-rules.md`).

Lược đồ SIMPLE/COMPLEX cũ vẫn còn được DB chấp nhận (`CHECK` constraint không xóa các giá trị cũ) để
không phá vỡ các dòng rule cũ do admin đã cấu hình trước đây, nhưng **không còn Epic nào được phân
loại là SIMPLE/COMPLEX nữa**. Các dòng Epic lịch sử đã được recompute/backfill (migration `20261201`,
`20261203`, `20261204`); dòng level NULL / "Chưa xác định" giữ `CT-Lv12` để rule R5 đánh dấu thiếu level.

## 3. Ngày làm việc

Toàn bộ tính toán thời gian trong hệ thống sử dụng **ngày làm việc**.

Ngày làm việc là ngày trong năm, không bao gồm:

- Thứ Bảy.
- Chủ Nhật.
- Các ngày Holiday được cấu hình trong hệ thống.

Hệ thống không dùng ngày lịch để đánh giá đạt/fail TTM trong phiên bản cập nhật này.

## 4. Hai ngày T của Epic

Mỗi Epic có hai mốc quan trọng:

| Mốc | Tên | Ý nghĩa |
|---|---|---|
| T0 | Ngày duyệt ý tưởng | Ngày yêu cầu được duyệt ý tưởng, là điểm bắt đầu TTM-E2E |
| T1 | Start Date | Ngày CNTT bắt đầu thực hiện, là điểm bắt đầu TTM-CNTT |

## 5. TTM-CNTT

TTM-CNTT là tiêu chí ưu tiên trong MVP1.

| Thuộc tính | Quy tắc |
|---|---|
| Bắt đầu | T1 = Epic.Start Date |
| Kết thúc | Epic.R4G Date |
| Đơn vị tính | Ngày làm việc |
| Target theo epic-type | Xem bảng phân loại Epic tại mục 2 (9 tổ hợp hợp lệ), cấu hình tại "Tiêu chí Time to Market" |
| Kết quả | Đạt TTM-CNTT hoặc Fail TTM-CNTT |

R4G Date là field nhập tay trên Jira.

Status history chỉ dùng để đối chiếu và cảnh báo chất lượng dữ liệu, không thay thế R4G Date.

## 6. TTM-E2E

TTM-E2E dùng để đo toàn bộ hành trình của yêu cầu.

| Thuộc tính | Quy tắc |
|---|---|
| Bắt đầu | T0 = Ngày duyệt ý tưởng |
| Kết thúc | Epic.R4G Date (xem cập nhật 24/09/2026 bên dưới — trước đó là Due Date) |
| Đơn vị tính | Ngày làm việc |
| Target theo epic-type | Xem bảng phân loại Epic tại mục 2 (9 tổ hợp hợp lệ), cấu hình tại "Tiêu chí Time to Market" |

Trong MVP1, TTM-E2E có thể được lưu và hiển thị tham khảo nhưng chưa phải trọng tâm cảnh báo chính.

> **Cập nhật (24/09/2026) — đổi điểm kết thúc TTM-E2E từ Due Date sang R4G Date:**
>
> - TTM-E2E nay đo từ **T0 đến R4G Date** (trước đó là Due Date). Ngày bắt đầu (T0) không đổi.
> - **FAIL/NONE** như trước (không có Cảnh báo sớm/muộn riêng). FAIL khi ngày kết thúc thực tế (R4G
>   Date đã qua, hoặc "hôm nay" nếu R4G Date chưa có/chưa qua) vượt baseline (T0 + số ngày làm việc
>   TTM-E2E theo `ttm_policy_configs`). T0 fallback không đổi: Idea Approved Date → ngày tạo Epic
>   trên Jira.
> - **Đạt TTM-E2E** nay yêu cầu **cả hai** điều kiện: Epic có status = **Released**, VÀ khoảng T0 →
>   R4G Date đạt tiêu chuẩn TTM-E2E của loại Epic đó (FAIL/NONE ở trên = NONE). Trước đó chỉ dựa vào
>   Due Date đã qua và đúng hạn.
> - Kỷ luật của **Due Date** (khi nào phải có, phải nằm trong khoảng nào so với R4G Date) tách thành
>   một trục riêng — xem mục 6.1 "Trục Release" bên dưới — không còn là một phần của phép tính
>   TTM-E2E nữa.
> - Nếu Epic bị đánh dấu `hasDataAnomaly` (xem `03-mvp1-working-days-alert-rules.md`), cả Fail
>   TTM-CNTT và Fail TTM-E2E đều bị ép về "Không tính được" thay vì hiện kết quả có thể sai.

### 6.1. Trục Release (Due Date vs R4G Date) — mới 24/09/2026

> **Cập nhật (01/10/2026) — chỉ áp dụng cho Epic Scoring Service, KHÔNG áp dụng cho logic cũ bên
> dưới:** badge "Chờ golive" (`RELEASE_WAITING_GOLIVE`) trong Scoring Service đã đổi hoàn toàn sang
> điều kiện theo status, không còn phụ thuộc R4G Date/hạn 5 ngày: **status = R4GOLIVE, HOẶC (status =
> RELEASED VÀ chưa có Due Date)** — và chỉ tính khi Epic nằm trong "Phạm vi dữ liệu cho TTM (QLDA)".
> Vì không còn gắn với mốc ngày, badge này giờ **có thể cùng active với "Giải trình Golive"** trên
> cùng 1 Epic (trước đây 2 badge loại trừ nhau). Trên TTM Dashboard, widget "Chờ golive" có thêm 3
> sub-link tách theo thời gian: "Thiếu R4G Date", "Trong hạn" (hôm nay ≤ R4G Date + 5 ngày làm việc),
> "Quá hạn" (còn lại) — xem `docs/superpowers/specs/2026-09-29-scoring-service-design.md` §6.3 và
> `src/lib/scoring/rules/release.ts`. Nội dung §6.1 bên dưới ("Chờ golive"/"Cảnh báo sớm" theo R4G
> Date + 5 ngày) mô tả **logic cũ (legacy)** — engine cũ đã gỡ 24/10/2026, Scoring Service là logic duy nhất; giữ
> lại làm lịch sử.

Sau khi TTM-E2E không còn dùng Due Date, kỷ luật ghi nhận Due Date được tách thành "trục Release"
riêng, độc lập với TTM-E2E, với 3 badge mới hiển thị trên cột **Nhận xét** (song song với các badge
Đạt/Fail/Sai Status/Sai lệch dữ liệu hiện có):

Toàn bộ trục này chỉ áp dụng cho Epic **đã có R4G Date** — Epic chưa qua R4GOLIVE (chưa có R4G Date)
không hiện badge nào ở trục này (chưa tới lúc đánh giá).

- **Rule hợp lệ**: Epic phải có status = **Released** VÀ Due Date không quá **5 ngày làm việc** kể
  từ R4G Date (`addWorkingDays(R4G Date, 5)`, không tính R4G Date là ngày thứ 1). Thoả cả hai →
  không hiện badge nào ở trục này (coi là bình thường).
- **Chờ golive** (cập nhật 24/09/2026 — chỉ áp dụng khi có R4G Date): Epic đã có R4G Date, hôm nay
  còn trong khoảng từ R4G Date đến R4G Date + 5 ngày làm việc, chưa có Due Date, VÀ status vẫn ≤
  R4GOLIVE (chưa qua giai đoạn R4GOLIVE). Badge trung tính, chưa phải cảnh báo.
- **Cảnh báo sớm** (trục Release): giống điều kiện "Chờ golive" ở trên (đã có R4G Date, còn trong
  hạn R4G Date + 5 ngày làm việc, chưa có Due Date) nhưng status Epic đã qua R4GOLIVE (ví dụ
  MVPDONE) — cùng một khoảng thời gian, khác nhau ở status hiện tại của Epic.
- **Giải trình Golive**: Epic đã có R4G Date, và một trong hai điều kiện sau đúng (không phụ thuộc
  status hiện tại):
  1. Đã có Due Date và Due Date > R4G Date + 5 ngày làm việc; hoặc
  2. Chưa có Due Date và hôm nay (hoặc ngày đang đánh giá) > R4G Date + 5 ngày làm việc.
- **Sai lệch dữ liệu** (rule R7, xem `03-mvp1-working-days-alert-rules.md` §4.5): đã có Due Date,
  Due Date ≤ R4G Date + 5 ngày làm việc (đúng hạn), NHƯNG status Epic chưa chuyển sang Released —
  rule này ưu tiên hơn "Cảnh báo sớm"/"Giải trình Golive" (2 badge đó im lặng trong trường hợp này,
  nhường chỗ cho badge "Sai lệch dữ liệu").

## 7. Giai đoạn TTM-CNTT

TTM-CNTT được phân bổ theo các giai đoạn:

| Giai đoạn | Tỷ trọng |
|---|---:|
| Phân tích | 20% |
| Phát triển | 30% |
| SIT và UAT | 30% |
| Pentest | 10% |
| Chuẩn bị Golive và Golive | 10% |
| Tổng | 100% |

Mỗi giai đoạn tương ứng một cột pha ở Quản trị Epic (DESIGN / DEV / TEST / PENTEST / R4GOLIVE). Từ 08/11/2026 pha
DEV/TEST được coi là hoàn thành theo tỉ lệ story đã qua pha (≥ 80%, bỏ qua story Cancelled/Pending), pha PENTEST theo
Pentest status của Epic (`epic_pentest_status` = Done) — chi tiết và dot "pha hiện tại": `13-epic-15-and-epic-30-management.md`.

Trong MVP1, rule cảnh báo trạng thái Epic chỉ tập trung vào hai trạng thái:

- Design.
- In Progress.

## 8. Pending

Pending không làm dừng TTM.

Khi Epic, Story hoặc Subtask chuyển Pending:

- TTM-CNTT vẫn tiếp tục chạy.
- TTM-E2E vẫn tiếp tục chạy.
- Target date không thay đổi.
- Thời gian Pending vẫn tính vào TTM.
- Pending được ghi nhận để phân tích nguyên nhân và cải tiến liên tục.

## 9. R4G Date và Due Date

R4G Date và Due Date là các trường nhập tay trên Jira.

| Field | Ý nghĩa | Dùng cho |
|---|---|---|
| R4G Date | Ngày Epic đạt Ready for Golive | Kết thúc TTM-CNTT **và** TTM-E2E (từ 24/09/2026, xem mục 6) |
| Due Date | Ngày Epic Released theo ghi nhận quản trị | Kỷ luật "trục Release" — không còn nằm trong phép tính TTM-E2E (xem mục 6.1) |

Nếu field ngày và status history không khớp, hệ thống vẫn dùng field ngày để tính TTM và sinh cảnh báo chất lượng dữ liệu.

## 10. Quan hệ Jira issue

| Quan hệ | Cách lấy |
|---|---|
| Story → Epic | Epic Link custom field trong Jira |
| Subtask → Story | `parent` trong Jira |

Trong Jira Data Center 8.2, Epic Link thường là custom field dạng `customfield_XXXXX`, cần tìm qua field name `Epic Link` hoặc custom key `com.pyxis.greenhopper.jira:gh-epic-link`.
