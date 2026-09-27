# 16 — TTM/QA Index: rule tính toán chi tiết

> Tài liệu này chốt lại rule tính toán **hiện hành** (2026-09-28) của toàn bộ các chỉ số TTM-Index/
> QA-Index/TTM-CNTT/TTM-E2E trong hệ thống — tử số, mẫu số, phạm vi dữ liệu, điều kiện Epic được
> tính, rule Pass/Fail, và các trường hợp bị loại khỏi phạm vi tính toán. Đọc file này khi cần biết
> **chính xác** một con số trên Dashboard 2 hoặc badge "Nhận xét" ở Quản trị Epic được tính ra sao.
>
> Nguồn code tương ứng (không lặp lại chi tiết implementation, chỉ trỏ tới):
> `src/lib/ttm-cntt-qa.ts` (summarizeTtmCntt/summarizeQaIndex), `src/lib/ttm-scope-rules.ts`
> (computeTtmCnttInScope/computeQaInScope), `src/lib/ttm-scope-config-service.ts` (cấu hình mặc
> định), `src/lib/epic-alert-service.ts`/`epic-alert-phase-service.ts` (nguồn tính alertLevel/
> ttmE2eAlertLevel per Epic), `src/lib/ttm-rules.ts` (computeTtmAlert — công thức TTM-CNTT gốc).

## 1. Hai trục khái niệm cần phân biệt trước

**Trục 1 — Phạm vi phân quyền** (tên gọi "(QLDA)" / "(PM)"):
- **(QLDA)** = tính trên **toàn bộ Epic trong hệ thống**, không phụ thuộc quyền hạn của user đang
  đăng nhập — một con số duy nhất, giống nhau với mọi người xem. Được cache lại (`ttm_index_global_cache`),
  không tính lại mỗi lần xem trang.
- **(PM)** = tính trên **Epic thuộc phạm vi phân quyền** của user đang đăng nhập (hoặc user đang được
  "Xem dưới dạng User") — mỗi user thấy một con số khác nhau tuỳ quyền hạn. Tính trực tiếp (live),
  không cache.

**Trục 2 — Phạm vi trạng thái Epic** (tên gọi "TTM-Index"/"TTM-CNTT" vs "QA-Index"):
- **TTM-Index / TTM-CNTT** (không có hậu tố QA) = tính trên **toàn bộ Epic** trong phạm vi phân
  quyền tương ứng ở Trục 1, bất kể Epic đang ở trạng thái nào (Design, Dev, Pending, Released...).
- **QA-Index / TTM-CNTT (QA)** = tính trên **cùng công thức TTM-CNTT**, nhưng thu hẹp lại chỉ những
  Epic có `currentStatus` hiện tại là **"MVP Done"** hoặc **"Released"** (xem `isTtmCnttQaInScope`,
  `src/lib/ttm-cntt-qa.ts`) — góc nhìn "Epic đã thực sự xong việc, QA đánh giá được".

→ 2 trục này **độc lập, kết hợp tự do**: `TTM-Index (QLDA)` = Trục1:QLDA × Trục2:TTM-CNTT,
`QA-Index (PM)` = Trục1:PM × Trục2:QA, v.v. **"TTM-CNTT (QLDA)"** và **"TTM-Index (QLDA)"** là
**cùng một con số** — "TTM-CNTT" là tên gọi bản chất phép tính, "TTM-Index" là tên widget hiển thị
trên UI. Tương tự **"TTM-CNTT (QA)"** ≡ **"QA-Index"**. Tài liệu này dùng tên "TTM-Index"/"QA-Index"
làm chính, chú thích tên "TTM-CNTT (...)" tương ứng ở mỗi mục.

**TTM-E2E** là một trục hoàn toàn khác — xem mục 6 — không có khái niệm QLDA/PM/QA riêng (chỉ có 1
công thức Fail/Đạt duy nhất, luôn tính theo phạm vi phân quyền của người xem, không cache).

## 2. Công thức chung: `summarizeTtmCntt` (TTM-Index) / `summarizeQaIndex` (QA-Index)

Với một tập hợp Epic `rows` (đã xác định theo Trục 1 + Trục 2 ở trên), với mỗi Epic:

1. Nếu `currentStatus` là **Cancelled** → **loại khỏi mọi tính toán hoàn toàn** (không tính vào tử
   số, mẫu số, lẫn tổng số).
2. (Chỉ với QA-Index) Nếu `currentStatus` **không phải** "MVP Done"/"Released" → loại khỏi tính toán.
3. (Kể từ 2026-09-27) Nếu Epic **không nằm trong "Phạm vi dữ liệu cho TTM"** đang áp dụng (xem mục 7)
   → loại khỏi tính toán hoàn toàn (không tính vào tử/mẫu số/tổng, giống hệt Cancelled).
4. Epic còn lại được cộng vào **`total`** (mẫu số "Tổng số Epic" mặc định — xem mục 8).
5. Nếu `alertLevel === 'FAIL'` → cộng vào **`fail`** (đếm riêng, **không** phụ thuộc điều kiện
   "eligible" ở bước 6 — một Epic có thể Fail TTM-CNTT dù chưa từng tới R4G).
6. Nếu Epic có **R4G Date đã ghi nhận** VÀ **không bị "Sai lệch dữ liệu"** (`hasDataAnomaly = false`)
   → Epic **"eligible"** (đủ điều kiện được đánh giá Pass/Fail chính thức):
   - cộng vào **`eligible`** (mẫu số của tỷ lệ %);
   - nếu `alertLevel === 'NONE'` → cộng vào **`pass`** (tử số — "Đạt TTM-CNTT").

**Công thức %** (`pctPrecise`, làm tròn 1 số thập phân ở UI; `pct` làm tròn số nguyên ở bảng ma trận):

```
nếu eligible > 0:  pct = pass / eligible × 100
nếu eligible = 0 và total > 0:  pct = (total - fail) / total × 100   ← fallback, tránh hiện 100%
                                                                         giả khi có Epic đã Fail
                                                                         nhưng chưa Epic nào tới R4G
nếu total = 0:  pct = 100
```

`alertLevel` (NONE/EARLY/LATE/FAIL) của từng Epic được tính bởi `computeTtmAlert`
(`src/lib/ttm-rules.ts`) — xem mục 5.

## 3. TTM-Index (QLDA) ≡ TTM-CNTT (QLDA)

- **Phạm vi**: toàn bộ Epic trong hệ thống, không lọc theo quyền hạn, không lọc theo trạng thái.
- **Nguồn dữ liệu**: `epic_alert_row_cache` (cache toàn công ty, tính lại sau mỗi lần import CSV
  hoặc mỗi khi Admin lưu lại "Phạm vi dữ liệu cho TTM").
- **Tử số / Mẫu số**: `pass` / `eligible` theo công thức mục 2.
- **Hiển thị**: widget góc phải header "Quản trị Epic" và 2 widget đầu tiên trên header Dashboard 2.
- **Cache**: có — không tính lại mỗi lần xem trang; chỉ tính lại khi import CSV mới, khi cấu hình
  "Phạm vi dữ liệu cho TTM" thay đổi, hoặc lần chạy cache tự động đầu ngày.

## 4. TTM-Index (PM) ≡ TTM-CNTT (PM / "nói chung")

- **Phạm vi**: Epic thuộc quyền truy cập của user đang xem (dự án/domain được phân quyền), không lọc
  theo trạng thái.
- **Trên "Quản trị Epic"**: đúng bằng phạm vi phân quyền, **không** bị thu hẹp thêm bởi filter toolbar
  đang chọn (Dự án/Domain/Status...) — badge/widget này luôn phản ánh "toàn bộ những gì tôi được
  phép thấy", không đổi theo bộ lọc đang xem.
- **Trên Dashboard 2**: phạm vi phân quyền của user, **có** bị thu hẹp thêm bởi filter Dự án/Domain/
  PM-SM đang chọn trên trang (đây là điểm khác biệt duy nhất so với "Quản trị Epic"), và **có** bị
  ảnh hưởng bởi Advanced Filter "Phạm vi dữ liệu cho TTM" (mục 7) nếu người dùng chỉnh sửa.
- **Cache**: không — tính trực tiếp (SQL aggregate trên `epic_alert_row_cache` theo phạm vi quyền,
  hoặc trên tập Epic đã tải sẵn ở Dashboard) mỗi lần trang tải/lọc lại.

## 5. `alertLevel` (TTM-CNTT) từng Epic được tính thế nào

`computeTtmAlert` (`src/lib/ttm-rules.ts`):

- **Mốc mục tiêu (target R4G Date / "TTM-CNTT baseline")** = Start Date (T1) + số ngày làm việc theo
  policy TTM-CNTT đang active cho loại Epic đó (`CT-Lv12`/`CT-Lv34`/`SP-Lv12`/`SP-Lv34`, cấu hình ở
  "Cấu hình cảnh báo" § Tiêu chí Time to Market).
- Nếu Epic **đã có R4G Date**: `FAIL` nếu R4G Date thực tế > mốc mục tiêu, ngược lại `NONE`.
- Nếu Epic **chưa có R4G Date**: so hôm nay với mốc mục tiêu — `FAIL` nếu đã quá hạn; `LATE`/`EARLY`
  nếu đã qua mốc cảnh báo muộn/sớm cấu hình riêng theo trạng thái+loại Epic; ngược lại `NONE`.
- **Epic Cancelled**: luôn `NONE` (không tính TTM cho Epic đã huỷ).
- `alertLevel` bị ép về `NONE` **chỉ khi** Epic thiếu Start Date hoặc R4G Date < Start Date (dữ liệu
  không đủ tin cậy để tính — `breaksTtmCnttCalculation`). Các sai lệch dữ liệu khác (thiếu
  Requirement Level, Pending quá lâu...) **không** ảnh hưởng `alertLevel` — chỉ ảnh hưởng việc Epic
  có "eligible" (mục 2 bước 6) hay không, qua cờ `hasDataAnomaly` (7 rule R1-R7, xem
  `src/lib/epic-data-anomaly.ts`).

## 6. TTM-E2E (Fail/Đạt) — trục riêng, không có QLDA/PM/QA

- **Baseline** = T0 (Idea Approved Date, hoặc Start Date, hoặc ngày tạo Epic trên Jira nếu chưa có
  2 mốc trên) + số ngày làm việc theo policy TTM-E2E đang active cho loại Epic.
- **Thực tế** = R4G Date một khi đã ghi nhận, đã qua hôm nay, và không sớm hơn T0 (nếu chưa có/còn ở
  tương lai/bất thường thì lấy hôm nay — vẫn đang đếm tiếp).
- **Fail TTM-E2E** = thực tế > baseline. Chỉ 2 mức Fail/Đạt (`FAIL`/`NONE`), không có EARLY/LATE.
  "Đạt TTM-E2E" (hiển thị ở UI) còn yêu cầu thêm status = **Released**.
- Đổi rule 2026-09-24: trước đó "thực tế" là Due Date, nay là R4G Date. Kỷ luật Due Date so với R4G
  Date (trong hạn 5 ngày làm việc hay không) tách thành khái niệm riêng **"Trục Release"** (badge
  Chờ golive/Cảnh báo sớm/Giải trình Golive, xem `resolveReleaseAxis`) + rule sai lệch dữ liệu R7
  (`RELEASE_STATUS_MISMATCH`), không còn nằm trong TTM-E2E.
- **Quan trọng**: TTM-E2E **không** bị ảnh hưởng bởi "Phạm vi dữ liệu cho TTM" (mục 7) — filter đó
  chỉ tác động tới trục TTM-CNTT/QA-Index. KPI "Fail TTM-E2E" và badge "Fail TTM-e2e"/"Đạt TTM-e2e"
  luôn tính trên toàn bộ Epic đủ điều kiện, không phân biệt trong/ngoài phạm vi TTM-CNTT.

## 7. "Phạm vi dữ liệu cho TTM" — gate bổ sung (từ 2026-09-27)

Cấu hình tại "Cấu hình cảnh báo" § Phạm vi dữ liệu cho TTM (mặc định để trống = không giới hạn, xem
mục 8), có thể override tạm thời (không lưu) qua Advanced Filters ở Dashboard 2.

- **`ttmCnttInScope`** (áp dụng cho TTM-Index/TTM-CNTT, mọi phạm vi QLDA/PM):
  - Có R4G Date: `A < R4G Date < B`.
  - Chưa có R4G Date: `A < TTM-CNTT baseline (target R4G Date) < B` thay thế.
  - Cả A và B trống → luôn `true` (không giới hạn — hành vi mặc định, giống hệt trước khi tính năng
    này tồn tại).
  - Epic không có **cả** R4G Date lẫn baseline (ví dụ thiếu luôn Start Date) mà đang có ít nhất 1
    trong A/B được cấu hình → bị loại (không có gì để so sánh).
- **`qaInScope`** (áp dụng cho QA-Index/TTM-CNTT (QA) — **độc lập** với `ttmCnttInScope`, không có
  fallback baseline):
  - `C < R4G Date < D`.
  - Cả C và D trống → luôn `true`.
  - Epic **chưa có R4G Date** mà đang có ít nhất 1 trong C/D được cấu hình → **luôn bị loại** khỏi
    phạm vi QA (không có baseline thay thế, khác với `ttmCnttInScope`).
- **Khi Epic bị `!ttmCnttInScope`**: badge "Nhận xét" ở Quản trị Epic/Epic in PO/Báo cáo hiện
  **"Ngoài phạm vi TTM-CNTT"** thay vì FAIL/LATE/EARLY/NONE/Sai Status/Đạt TTM-CNTT — Epic **vẫn
  hiển thị bình thường** trong bảng (không biến mất), chỉ riêng phán quyết TTM-CNTT bị ẩn.
- Badge/tính toán **TTM-E2E** và **Trục Release** (Chờ golive/Giải trình Golive) **không** bị ảnh
  hưởng bởi 2 cờ này.

## 8. Phạm vi mặc định "Tổng số Epic" (khi chưa cấu hình gì ở mục 7)

Với `ttmCnttInScope`/`qaInScope` luôn `true` mặc định, phạm vi "Tổng số Epic" tính TTM-Index/QA-Index
hôm nay = mọi Epic trong hệ thống (hoặc trong quyền hạn của user), **trừ**:

1. Epic có `currentStatus` = **Cancelled** (loại hoàn toàn khỏi mọi tính toán TTM-Index/QA-Index —
   không tính cả tử số lẫn mẫu số).
2. (Chỉ với QA-Index) Epic **không** ở trạng thái MVP Done/Released.

## 9. Các trường hợp bị loại khỏi phạm vi tính toán — tóm tắt

| Trường hợp | Bị loại khỏi | Vẫn hiển thị trong bảng danh sách? |
|---|---|---|
| `currentStatus` = Cancelled | Mọi tính toán TTM-Index/QA-Index (tử/mẫu/tổng) | Có (nếu filter Status cho phép) |
| Không ở MVP Done/Released | Riêng QA-Index (vẫn tính TTM-Index bình thường) | Có |
| `hasDataAnomaly = true` (vi phạm 1 trong 7 rule R1-R7) | Mẫu số `eligible` (không được coi là "đã Pass/Fail chính thức") — **`fail` vẫn tính bình thường** nếu `alertLevel = FAIL` | Có, kèm badge "Sai lệch dữ liệu" |
| Thiếu Start Date, hoặc R4G Date < Start Date | `alertLevel` bị ép `NONE` (không thể tính TTM-CNTT) | Có, cột TTM-CNTT hiện "Không tính được" |
| `!ttmCnttInScope` (ngoài "Phạm vi dữ liệu cho TTM") | Mọi tính toán TTM-Index/TTM-CNTT (tử/mẫu/tổng) | Có, badge "Ngoài phạm vi TTM-CNTT" |
| `!qaInScope` (ngoài phạm vi QA) | Mọi tính toán QA-Index (tử/mẫu/tổng) — không ảnh hưởng TTM-Index | Có |

## 10. Ghi chú vận hành

- Sau mỗi lần import CSV, hoặc mỗi khi Admin lưu "Phạm vi dữ liệu cho TTM", hệ thống tự động tính lại
  và ghi cache 2 chỉ số (QLDA): `ttm_index_global_cache` — xem `src/lib/daily-cache-service.ts`
  (`refreshDerivedCaches`). Các chỉ số (PM) không cache, luôn tính trực tiếp theo dữ liệu mới nhất.
- Ngoài ra, `epic_alert_row_cache` (cache toàn bộ dòng Epic đã tính sẵn `alertLevel`/
  `ttmCnttInScope`/`qaInScope`/...) cũng được tính lại cùng lúc, phục vụ Quản trị Epic/Epic in PO/
  Dashboard đọc nhanh thay vì tính lại mỗi lần xem trang.
