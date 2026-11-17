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
| REQ-20261117-01 | Dùng popup "Thông tin Epic" thay thế "Duyệt Epic" trên mọi màn hình; mở rộng popup Thông tin người dùng ×2; điều chỉnh popup "Thông tin Epic" (chủ sản phẩm, 17/11/2026) | N/A – không có BRD/spec riêng; tham chiếu `docs/kb/features/epic-alerts-15.md` | (1) Bấm epic key mọi nơi mở "Thông tin Epic"; (2) popup đổi tên "Thông tin Epic {key}" + subtitle "{dự án} / {summary}" + to hơn 20% + cao hơn 10% + toggle "Epic ngoại lệ" dạng switch (FALSE=OFF, TRUE=ON) cạnh "Ẩn epic" + icon cảnh báo tab "Giải trình Fail TTM" + item "Đánh giá" hiển thị badge pass/fail TTM-CNTT & TTM-E2E; (3) popup Thông tin người dùng rộng gấp 2 | `/api/epic-marks/[epicKey]` GET thêm `canEditBlackList`; `EpicBrowserSummary` thêm `ttmE2eVerdict`/`ttmE2eVerdictLabel` (đều thêm trường, tương thích ngược) | `EpicMarkModal` (title/subtitle/toggle switch/height/"Đánh giá"), `EpicMarkCell`, `TtmBlackListToggle` (mới), `UserInfoModal`, `NormalizationEpicTable`, `epic-alerts-15`, `data-normalization`, `EarlyStartReportScreen`, `EpicReportScreen`, `src/lib/epic-browser-service.ts` (TTM-E2E verdict) | `npm test` 548/548 pass | `tsc --noEmit`, `npm run lint`, `npm run build` pass (bản build 17/11) | Chưa commit | Đã test local |

| REQ-20261116-01 | Bỏ masking dữ liệu TTM khi đã chạy trên UAT MB (dunglq1) | `brd/07-data-source-and-csv-import.md` | Tên Epic, issue key hiển thị đúng dữ liệu gốc Jira | N/A – masking nằm ở Jira crawl tool, không ở service/DB | Rà soát `qlda-tool-uat`: không có masking trong `src/`, `db/`; còn `scripts/mask-jira-csv.js` (chỉ đổi key CSV, chạy tay) | – | – | – | Đang làm (chờ mã nguồn crawl tool) |
