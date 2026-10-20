# Đóng gói mã nguồn TTM Monitor

Tự đóng gói ứng dụng thành file `.zip` mà không cần AI agent. Chạy trên Windows (PowerShell 5.1 có sẵn) và cần Git
for Windows (script dùng `git` để biết file nào được loại trừ theo `.gitignore`).

## Cách chạy

- **Bấm đúp `package.cmd`** rồi chọn:
  - `1` — đóng gói **toàn bộ** ứng dụng;
  - `2` — chỉ đóng gói **phần code mới / thay đổi** so với lần đóng gói trước.
- Hoặc từ dòng lệnh:

```bat
tools\packaging\package.cmd -Mode Full
tools\packaging\package.cmd -Mode Incremental
tools\packaging\package.cmd -Mode Incremental -Baseline D:\goi-cu\ttm-tool-full-....zip
```

File zip và manifest nằm ở `release-packages\` trong thư mục mã nguồn (thư mục này đã được `.gitignore` loại trừ, nên
không bao giờ bị đóng gói lại hay đẩy lên repo). Đổi nơi lưu bằng `-OutputDir <thư mục>`.

## Gói gồm những gì

- Mọi file git đang theo dõi **và** file mới chưa commit, trừ những gì `.gitignore` loại trừ (`node_modules`, `.next`,
  `.env*`, `/backups`, font `.otf/.ttf`…). File đã xoá trên đĩa nhưng chưa commit không có trong gói.
- `_package/manifest.json` — danh sách đầy đủ file + mã băm SHA-256 tại thời điểm đóng gói, build trong `version.json`,
  git commit.
- `_package/README.txt` — tóm tắt gói và các bước cài.
- Riêng Option 2: `_package/CHANGED_FILES.txt` (file mới / thay đổi có trong gói) và `_package/DELETED_FILES.txt`
  (file có ở lần trước nhưng nay đã xoá — xoá tay ở nơi cài).

Tên gói: `ttm-tool-full-<build>-<yyyyMMdd-HHmmss>.zip` hoặc `ttm-tool-incr-<build>-<yyyyMMdd-HHmmss>.zip`.

## Option 2 so sánh với cái gì

Mỗi lần đóng gói (Option 1 hay 2) lưu một manifest vào `release-packages\manifests\`, luôn ghi **toàn bộ** danh sách
file của thời điểm đó. Option 2 lấy manifest **mới nhất** trong thư mục này, so mã băm từng file và chỉ đóng gói file
mới hoặc có nội dung khác. Không có gì thay đổi thì không tạo gói. Manifest chỉ được ghi khi zip đã tạo xong, nên một
lần chạy lỗi không trở thành mốc so sánh.

Đóng gói ở máy khác hoặc đã xoá `release-packages\`: truyền `-Baseline` trỏ tới gói `.zip` cũ (script đọc
`_package/manifest.json` bên trong) hoặc tới file manifest `.json`.

## Cài gói ở môi trường đích

1. Giải nén gói Full vào thư mục ứng dụng (lần sau: giải nén gói Incremental đè lên, rồi xoá các file trong
   `_package/DELETED_FILES.txt`).
2. `npm ci`
3. Có migration mới (`db/migrations/`) thì `node scripts/migrate-db.js --target=local`. DB mới hoàn toàn: xem
   `db/install/README.md`.
4. `npm run build` rồi `npm start` (chi tiết triển khai: Tài liệu sản phẩm mục 1.1).
