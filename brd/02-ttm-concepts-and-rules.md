# 02 — TTM Concepts and Rules

## 1. Hai tiêu chí Time to Market

Hệ thống theo dõi hai tiêu chí:

| Tiêu chí | Ý nghĩa | Trọng tâm MVP1 |
|---|---|---|
| TTM-CNTT | Thời gian xử lý trong phạm vi CNTT | Có |
| TTM-E2E | Toàn bộ hành trình từ duyệt ý tưởng tới Released | Chưa phải trọng tâm MVP1 |

## 2. Epic đơn giản và Epic phức tạp

Để dễ sử dụng trong BRD và giao diện, hệ thống dùng hai thuật ngữ:

| Loại Epic | TTM-CNTT | TTM-E2E |
|---|---:|---:|
| Epic đơn giản | 3 tuần = 15 ngày làm việc | 6 tuần = 30 ngày làm việc |
| Epic phức tạp | 6 tuần = 30 ngày làm việc | 10 tuần = 50 ngày làm việc |

Các giá trị target có thể cấu hình được trong ứng dụng bởi CBQL Phòng.

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
| Target Epic đơn giản | 15 ngày làm việc |
| Target Epic phức tạp | 30 ngày làm việc |
| Kết quả | Đạt TTM-CNTT hoặc Fail TTM-CNTT |

R4G Date là field nhập tay trên Jira.

Status history chỉ dùng để đối chiếu và cảnh báo chất lượng dữ liệu, không thay thế R4G Date.

## 6. TTM-E2E

TTM-E2E dùng để đo toàn bộ hành trình của yêu cầu.

| Thuộc tính | Quy tắc |
|---|---|
| Bắt đầu | T0 = Ngày duyệt ý tưởng |
| Kết thúc | Epic.Due Date |
| Đơn vị tính | Ngày làm việc |
| Target Epic đơn giản | 30 ngày làm việc |
| Target Epic phức tạp | 50 ngày làm việc |

Due Date là field nhập tay trên Jira.

Trong MVP1, TTM-E2E có thể được lưu và hiển thị tham khảo nhưng chưa phải trọng tâm cảnh báo chính.

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
| R4G Date | Ngày Epic đạt Ready for Golive | Kết thúc TTM-CNTT |
| Due Date | Ngày Epic Released theo ghi nhận quản trị | Kết thúc TTM-E2E |

Nếu field ngày và status history không khớp, hệ thống vẫn dùng field ngày để tính TTM và sinh cảnh báo chất lượng dữ liệu.

## 10. Quan hệ Jira issue

| Quan hệ | Cách lấy |
|---|---|
| Story → Epic | Epic Link custom field trong Jira |
| Subtask → Story | `parent` trong Jira |

Trong Jira Data Center 8.2, Epic Link thường là custom field dạng `customfield_XXXXX`, cần tìm qua field name `Epic Link` hoặc custom key `com.pyxis.greenhopper.jira:gh-epic-link`.
