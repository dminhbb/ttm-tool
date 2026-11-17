# Traceability — TTM Monitor

Ma trận nối mỗi yêu cầu thay đổi với BRD, contract, code, test và commit. Quy trình dùng file này:
`QUY_TRINH_PHAT_TRIEN.md` (bước 3 tạo dòng, các bước sau điền dần).

Quy ước:

- Mã yêu cầu: `REQ-yyyymmdd-nn` (ngày nhận yêu cầu, số thứ tự trong ngày).
- Trạng thái: `Đã phân tích` → `Đang làm` → `Đã test local` → `Đã push` → `Đã deploy UAT` (hoặc `Huỷ` kèm lý do).
- Cột không áp dụng ghi `N/A – lý do`.
- Dòng mới thêm lên đầu bảng.

| Mã | Yêu cầu (người yêu cầu, ngày) | BRD / Spec | Tiêu chí nghiệm thu | Contract | Code | Unit test | Test thông luồng | Commit / Pipeline | Trạng thái |
|---|---|---|---|---|---|---|---|---|---|
| REQ-20261116-01 | Bỏ masking dữ liệu TTM khi đã chạy trên UAT MB (dunglq1) | `brd/07-data-source-and-csv-import.md` | Tên Epic, issue key hiển thị đúng dữ liệu gốc Jira | N/A – masking nằm ở Jira crawl tool, không ở service/DB | Rà soát `qlda-tool-uat`: không có masking trong `src/`, `db/`; còn `scripts/mask-jira-csv.js` (chỉ đổi key CSV, chạy tay) | – | – | – | Đang làm (chờ mã nguồn crawl tool) |
