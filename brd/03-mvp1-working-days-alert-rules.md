# 03 — MVP1 Working Days Alert Rules

## 1. Phạm vi cảnh báo MVP1

MVP1 chỉ cảnh báo rủi ro **TTM-CNTT**.

Cảnh báo chỉ áp dụng với Epic có trạng thái:

- Design.
- In Progress.

Các Epic ở trạng thái To Do được đưa vào Panel 3 để chờ kế hoạch, không áp dụng rule cảnh báo TTM-CNTT.

Các Epic thiếu Start Date nhưng đã qua To Do được đưa vào Panel 2 để cảnh báo thiếu dữ liệu đầu vào.

## 2. Cột Cảnh báo trên danh sách Epic

Danh sách Epic cần có cột **Cảnh báo**.

Nếu Epic không có cảnh báo thì ô này để trống.

Các mức cảnh báo:

| Mức cảnh báo | Ý nghĩa |
|---|---|
| Cảnh báo sớm | Epic sắp chạm mốc cảnh báo của trạng thái hiện tại |
| Cảnh báo muộn | Epic đã chạm mốc muộn, cần ưu tiên xử lý |
| Fail TTM-CNTT | Epic đã vượt mục tiêu TTM-CNTT hoặc R4G Date sau target |

## 3. Bảng rule cảnh báo MVP1

### 3.1. Epic đơn giản

Epic đơn giản có TTM-CNTT là 15 ngày làm việc.

| Trạng thái Epic | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---:|---:|---:|
| Design | T1 + 2 ngày làm việc | T1 + 3 ngày làm việc | T1 + 15 ngày làm việc |
| In Progress | T1 + 12 ngày làm việc | T1 + 13 ngày làm việc | T1 + 15 ngày làm việc |

### 3.2. Epic phức tạp

Epic phức tạp có TTM-CNTT là 30 ngày làm việc.

| Trạng thái Epic | Cảnh báo sớm | Cảnh báo muộn | Fail TTM-CNTT |
|---|---:|---:|---:|
| Design | T1 + 5 ngày làm việc | T1 + 6 ngày làm việc | T1 + 30 ngày làm việc |
| In Progress | T1 + 19 ngày làm việc | T1 + 20 ngày làm việc | T1 + 30 ngày làm việc |

## 4. Quy tắc xác định cảnh báo

### 4.1. Không cảnh báo

Nếu Epic đã có R4G Date và R4G Date nhỏ hơn hoặc bằng Target R4G Date, Epic đạt TTM-CNTT và cột Cảnh báo để trống hoặc hiển thị kết quả đạt theo quy chuẩn UI.

Nếu Epic đang ở trạng thái không thuộc Design hoặc In Progress trong MVP1, hệ thống không áp dụng cảnh báo trạng thái, trừ các cảnh báo chất lượng dữ liệu.

### 4.2. Cảnh báo sớm

```text
Current Working Date >= Early Alert Date
AND Current Working Date < Late Alert Date
AND Epic Status in (Design, In Progress)
AND R4G Date is null
```

### 4.3. Cảnh báo muộn

```text
Current Working Date >= Late Alert Date
AND Current Working Date < Fail TTM-CNTT Date
AND Epic Status in (Design, In Progress)
AND R4G Date is null
```

### 4.4. Fail TTM-CNTT

```text
Current Working Date > Target R4G Date
AND R4G Date is null
```

Hoặc:

```text
R4G Date > Target R4G Date
```

## 5. Cách tính mốc ngày

Tất cả mốc ngày được tính bằng ngày làm việc.

```text
Alert Date = addWorkingDays(T1, offset)
```

Trong đó:

- `T1` là Start Date.
- `offset` là số ngày làm việc cấu hình trong rule.
- Hàm `addWorkingDays` bỏ qua Thứ Bảy, Chủ Nhật và Holiday.

## 6. Ví dụ

### 6.1. Epic đơn giản ở Design

```text
T1 = 01/08
Epic Type = Epic đơn giản
Status = Design
```

Rule:

```text
Cảnh báo sớm = T1 + 2 ngày làm việc
Cảnh báo muộn = T1 + 3 ngày làm việc
Fail = T1 + 15 ngày làm việc
```

### 6.2. Epic phức tạp ở In Progress

```text
T1 = 01/08
Epic Type = Epic phức tạp
Status = In Progress
```

Rule:

```text
Cảnh báo sớm = T1 + 19 ngày làm việc
Cảnh báo muộn = T1 + 20 ngày làm việc
Fail = T1 + 30 ngày làm việc
```

## 7. Acceptance Criteria

```gherkin
Given Epic đơn giản có T1
And Epic status = Design
When Current Working Date >= T1 + 2 ngày làm việc
And Current Working Date < T1 + 3 ngày làm việc
Then cột Cảnh báo hiển thị "Cảnh báo sớm"
```

```gherkin
Given Epic đơn giản có T1
And Epic status = Design
When Current Working Date >= T1 + 3 ngày làm việc
And Current Working Date < T1 + 15 ngày làm việc
Then cột Cảnh báo hiển thị "Cảnh báo muộn"
```

```gherkin
Given Epic phức tạp có T1
And Epic status = In Progress
When Current Working Date >= T1 + 19 ngày làm việc
And Current Working Date < T1 + 20 ngày làm việc
Then cột Cảnh báo hiển thị "Cảnh báo sớm"
```

```gherkin
Given Epic có Target R4G Date
And R4G Date is null
When Current Working Date > Target R4G Date
Then cột Cảnh báo hiển thị "Fail TTM-CNTT"
```

## 8. API đánh giá cảnh báo và tuân thủ

`POST /api/epic-compliance` là contract nghiệp vụ tập trung cho Epic, Story và Subtask. API yêu cầu người dùng đã đăng nhập, nhận `items` (tối đa 500) cùng `evaluatedAt` tùy chọn theo định dạng `YYYY-MM-DD`.

- Epic nhận `startDate`, `ideaApprovedDate`, `r4gDate`, `dueDate`, `status` và `epicComplexityType`; API trả baseline Design, In Progress, R4G, Released; `alertLevel`; trạng thái tuân thủ và các finding chất lượng dữ liệu.
- Story cần `epicKey`; Subtask cần `parentKey` và `epicKey`. MVP1 chưa đặt deadline TTM riêng cho hai cấp này, nên API trả `NOT_APPLICABLE` nếu hợp lệ hoặc `AT_RISK` kèm finding khi thiếu liên kết.
- Rule status/offset được đọc từ `epic_status_alert_rules` active; ngày baseline luôn tính bằng ngày làm việc và Holiday đang active.
- Status không có rule active không phát sinh cảnh báo status, nhưng baseline R4G vẫn được đánh giá; API trả finding thông tin để quản trị viên biết cần cấu hình rule.

## 9. Logic hiển thị từng ô cột Status trên bảng Epic (`GET /api/epic-alerts`)

Mục này chỉ áp dụng cho các cột **Design**, **In Progress**, **Ready4Golive** trên danh sách Epic (`GET /api/epic-alerts`, implementation tại `getEpicAlertRows` trong `src/lib/epic-alert-service.ts`). Đây là logic hiển thị theo từng ô, tách biệt với cột **Nhận xét** (mục 2–4 ở trên, dựa trên `POST /api/epic-compliance`).

### 9.1. Thứ tự trạng thái Epic

```text
To Do → IN PO → Design → In Progress → R4GOLIVE → MVPDONE → PILOT → Released
```

Trường `R4G Date` trên Epic tương ứng với ngày hoàn thành trạng thái **R4GOLIVE**. Status không khớp thứ tự nào ở trên (kể cả Cancelled) được xếp sau cùng — coi như Epic đã đi qua mọi cột.

### 9.2. Target của một cột Status

```text
Target(status) = addWorkingDays(T1, offset "cảnh báo muộn" cấu hình cho status đó)
```

`offset` đọc từ `epic_status_alert_rules` active theo `(epic_complexity_type, epic_status)`; nếu chưa có rule cho status của cột, ô hiển thị "Chưa cấu hình rule cảnh báo" (không tính được).

### 9.3. Rule TTM-CNTT-1 đến TTM-CNTT-6

So sánh vị trí status hiện tại của Epic với vị trí status của cột (theo thứ tự ở mục 9.1):

| Rule | Điều kiện | Kết quả hiển thị tại ô |
|---|---|---|
| TTM-CNTT-1 | `today < Mốc cảnh báo sớm` VÀ status Epic đứng **trước** status của ô | `Target: <ngày>` |
| TTM-CNTT-2 | (`today < Mốc cảnh báo sớm` HOẶC `Mốc cảnh báo sớm < today < Mốc cảnh báo muộn`) VÀ status Epic **=** status của ô | `Target: <ngày>` |
| TTM-CNTT-3 | `today = Mốc cảnh báo sớm` VÀ status Epic **=** status của ô | Badge "Cảnh báo sớm" nền light orange |
| TTM-CNTT-4 | `today = Mốc cảnh báo muộn` VÀ status Epic **=** status của ô | Badge "Cảnh báo muộn" nền light red |
| TTM-CNTT-5 | `today > Mốc cảnh báo muộn` VÀ status Epic **=** status của ô | Badge "Cảnh báo muộn" nền light red |
| TTM-CNTT-6 | `today > Mốc cảnh báo muộn` VÀ status Epic đứng **sau** status của ô | Icon completed |

Hai tổ hợp không được liệt kê tường minh ở trên được mở rộng để mọi ô luôn có giá trị hiển thị:

- Status Epic đứng trước status của ô, nhưng `today ≥ Mốc cảnh báo sớm` (mở rộng TTM-CNTT-1): vẫn hiển thị `Past target: <ngày>` (đổi nhãn "Target" thành "Past target" vì đã quá mốc sớm) thay vì badge, vì Epic chưa thực sự vào giai đoạn này.
- Status Epic đứng sau status của ô, nhưng `today ≤ Mốc cảnh báo muộn` (mở rộng TTM-CNTT-6): vẫn hiển thị icon completed — Epic đã qua giai đoạn này thì luôn là "đã xong", không phụ thuộc mốc ngày.

Ô icon completed của cột **Ready4Golive** hiển thị **ngày R4G Date thực tế** (thay icon) khi trường này có dữ liệu; các cột **Design**/**In Progress** không có ngày hoàn thành thực tế nên chỉ hiển thị icon.

Ô không hiển thị thông tin "Mốc cảnh báo sớm" dưới dạng text (chỉ dùng nội bộ để so sánh điều kiện); chữ "Mốc cảnh báo muộn" hiển thị ra UI là **"Target"**, và trường hợp mở rộng của TTM-CNTT-1 hiển thị là **"Past target"**.

### 9.4. Ví dụ

```text
T1 = 01/08, Epic phức tạp, rule In Progress: sớm = T1+19, muộn = T1+20
Status Epic hiện tại = In Progress
```

- `today` = 05/08 (< mốc sớm): ô In Progress hiển thị `Target: <T1+20>` (TTM-CNTT-2).
- `today` = mốc sớm: ô In Progress hiển thị badge "Cảnh báo sớm" (TTM-CNTT-3).
- `today` = mốc muộn hoặc sau đó: ô In Progress hiển thị badge "Cảnh báo muộn" (TTM-CNTT-4/5).
- Nếu Status Epic đã chuyển sang R4GOLIVE (đứng sau In Progress): ô In Progress hiển thị icon completed (TTM-CNTT-6), bất kể `R4G Date` đã có hay chưa — vì so sánh dựa trên status hiện tại, không dựa trên `r4gDate is null`.
