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
