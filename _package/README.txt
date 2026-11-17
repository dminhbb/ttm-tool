Gói: ttm-tool-full-261110.1831-20261111-083636
Kiểu: Toàn bộ ứng dụng
Build (version.json): 261110.1831    Git commit: 68b7037
Tạo lúc: 2026-11-11T08:36:36+07:00

Giải nén vào thư mục mã nguồn (Option 2: chép đè lên bản trước, rồi xoá các file trong _package/DELETED_FILES.txt).
Sau đó: npm ci  ->  node scripts/migrate-db.js --target=local (nếu có migration mới)  ->  npm run build  ->  npm start.