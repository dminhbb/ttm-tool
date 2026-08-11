# 04 — Homepage and Epic Monitoring

## 1. Mục tiêu Homepage

Homepage là màn hình vận hành chính để theo dõi Epic và rủi ro TTM-CNTT.

Homepage chia Epic thành 3 panel theo mức độ sẵn sàng dữ liệu và trạng thái kế hoạch.

## 2. Date filter

Dữ liệu nguồn của ứng dụng được thu thập tích lũy hằng ngày, vì vậy filter ngày trên cùng của Homepage phải là khoảng ngày:

- From date.
- To date.

Không sử dụng một date filter đơn lẻ.

## 3. Menu trái

Các menu quản trị được gom vào một menu cha:

```text
Quản trị hệ thống
├── User Management
├── Domain
├── Dự án
├── Holiday
├── Status Mapping / Status Alert Rules
├── Nguồn dữ liệu
└── Cấu hình TTM
```

Các menu vận hành chính ở cấp ngoài:

- Trang chủ.
- Epic Monitoring.
- Alert Center.
- Epic Detail.
- Báo cáo, nếu có.

## 3.1. Trang Cảnh báo Epic

Trang `/epic-alerts` là màn hình read-only, dùng lớp import mới nhất để tính và hiển thị cảnh báo Epic. Màn hình phân quyền theo role: SUPERADMIN xem toàn bộ, ADMIN xem các dự án thuộc Domain được gán, USER xem các dự án được phân công PM/SM. Các lớp snapshot cũ được giữ để phát triển tra cứu lịch sử cảnh báo sau này, nhưng không được trộn vào cảnh báo hiện hành.

## 4. Nguyên tắc 3 panel Homepage

Homepage có 3 panel:

| Panel | Điều kiện | Mục tiêu |
|---|---|---|
| Panel 1 | Epic đã có Start Date | Theo dõi TTM-CNTT, ưu tiên cao nhất |
| Panel 2 | Epic thiếu Start Date và trạng thái sau To Do | Cảnh báo thiếu dữ liệu planning quan trọng |
| Panel 3 | Epic ở trạng thái To Do | Backlog chờ đưa vào kế hoạch làm việc |

Một Epic chỉ được xuất hiện ở một panel.

Thứ tự ưu tiên phân loại:

1. Nếu Epic ở trạng thái To Do → Panel 3.
2. Nếu Epic không phải To Do và thiếu Start Date → Panel 2.
3. Nếu Epic có Start Date → Panel 1.

## 5. Quy tắc cột bảng

Panel 1, Panel 2 và Panel 3 cần có quy tắc và thứ tự sắp xếp các cột tương đương nhau.

Các cột dùng chung nên đặt trước.

Các cột đặc thù của từng panel đặt ở cuối.

## 6. Cột chuẩn dùng chung

Thứ tự cột chuẩn đề xuất:

1. Risk.
2. Epic Key.
3. Epic Name.
4. Current Status.
5. Domain.
6. Dự án.
7. Assignee / Owner.
8. Epic Type.
9. T0 — Ngày duyệt ý tưởng.
10. T1 — Start Date.
11. Missing Standard Info.
12. Cảnh báo.

## 7. Panel 1 — Epic đã có Start Date

### 7.1. Mục đích

Panel 1 là panel quan trọng nhất vì người dùng thuộc khối CNTT cần ưu tiên theo dõi rủi ro TTM-CNTT.

### 7.2. Điều kiện hiển thị

```text
Epic.Start Date is not null
AND Epic status != To Do
```

### 7.3. Cột đặc thù đặt cuối

- Target R4G Date.
- R4G Date.
- TTM-CNTT Progress.
- Số ngày làm việc còn lại.
- Pending count.
- Status TTM-CNTT.

### 7.4. Sắp xếp mặc định

1. Fail TTM-CNTT.
2. Cảnh báo muộn.
3. Cảnh báo sớm.
4. Missing Standard Info nhiều nhất.
5. Target R4G Date gần nhất.

## 8. Panel 2 — Epic thiếu Start Date và trạng thái sau To Do

### 8.1. Mục đích

Panel 2 dùng để phát hiện Epic đã đi qua giai đoạn To Do nhưng thiếu Start Date, khiến hệ thống không thể tính TTM-CNTT chính xác.

### 8.2. Điều kiện hiển thị

```text
Epic.Start Date is null
AND Epic status != To Do
AND Epic status not in (Cancelled, Released)
```

### 8.3. Cột đặc thù đặt cuối

- Current Step Note / Progress Note.
- Số ngày kể từ T0.
- Possible Impact.
- Pending count.

### 8.4. Missing Standard Info

Panel 2 thường hiển thị các thiếu sót:

- Start Date.
- Epic Type.
- Owner.
- T0.
- R4G Date, nếu status đã Ready for Golive.
- Due Date, nếu status đã Released.

### 8.5. Sắp xếp mặc định

1. Current Status tiến xa nhất.
2. Missing Standard Info nhiều nhất.
3. Số ngày kể từ T0 lớn nhất.
4. Pending count lớn nhất.

## 9. Panel 3 — Epic ở trạng thái To Do

### 9.1. Mục đích

Panel 3 là danh sách backlog chờ đưa vào kế hoạch làm việc.

### 9.2. Điều kiện hiển thị

```text
Epic status = To Do
```

### 9.3. Cột đặc thù đặt cuối

- Backlog Note.
- Số ngày kể từ T0.
- Planned Quarter, nếu có.
- Business Priority, nếu có.

### 9.4. Sắp xếp mặc định

1. Số ngày kể từ T0 lớn nhất.
2. Business Priority cao nhất.
3. Ngày duyệt ý tưởng cũ nhất.

## 10. Missing Standard Info

Cột Missing Standard Info hiển thị các thông tin tiêu chuẩn còn thiếu.

Ví dụ:

```text
Start Date, Epic Type, Owner
```

Nếu không thiếu thông tin, hiển thị trống hoặc `0` theo thiết kế UI.

## 11. Cảnh báo

Cột Cảnh báo hiển thị theo rule tại `03-mvp1-working-days-alert-rules.md`.

Nếu không có cảnh báo, ô này để trống.

## 12. Acceptance Criteria

```gherkin
Given Epic có Start Date
And Epic không ở trạng thái To Do
When mở Homepage
Then Epic xuất hiện ở Panel 1
```

```gherkin
Given Epic thiếu Start Date
And Epic có trạng thái sau To Do
When mở Homepage
Then Epic xuất hiện ở Panel 2
And cột Missing Standard Info có Start Date
```

```gherkin
Given Epic ở trạng thái To Do
When mở Homepage
Then Epic xuất hiện ở Panel 3
```

```gherkin
Given người dùng chọn From date và To date
When hệ thống tải Homepage
Then dữ liệu được lọc theo khoảng ngày thu thập tích lũy
```
