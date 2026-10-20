# Cài đặt CSDL mới cho TTM Monitor

Dùng khi đưa ứng dụng lên một môi trường mới (Node.js host + PostgreSQL nội bộ). Kiến trúc và cách chạy
ứng dụng: Tài liệu sản phẩm mục 1.1. Cấu trúc CSDL chi tiết: Tài liệu sản phẩm chương 5 và `docs/database-erd.md`.

| File | Nội dung |
|---|---|
| `ttm-monitor-schema.sql` | Toàn bộ cấu trúc hiện hành: 60 bảng, khoá chính / UNIQUE / CHECK, index, khoá ngoại, 4 hàm + 4 trigger. **Không có dữ liệu nghiệp vụ.** Cuối file ghi sẵn tên các migration đã gộp vào bảng `schema_migrations`. |

File được **sinh tự động** bởi `node scripts/db-schema-export.js` từ một CSDL đã chạy đủ migration — không sửa tay.
Mỗi khi thêm migration mới, chạy lại lệnh đó để file, chương 5 của Tài liệu sản phẩm và `docs/database-erd.md` khớp với schema.

## 1. Tạo CSDL và chạy file schema

Yêu cầu PostgreSQL 14 trở lên, không cần extension. Ví dụ với `psql`:

```bash
createdb -U postgres ttm_tool
psql "postgres://postgres:MAT_KHAU@DB_HOST:5432/ttm_tool" -v ON_ERROR_STOP=1 -f db/install/ttm-monitor-schema.sql
```

(Hoặc mở file trong pgAdmin / DBeaver và chạy toàn bộ.) Cả file chạy trong một transaction: nếu DB đã có bảng
trùng tên, lệnh dừng ở lỗi đầu tiên và không tạo gì — chỉ dùng cho **database rỗng**.

## 2. Tạo tài khoản SUPERADMIN đầu tiên

DB mới không có user nào. Tạo mã băm mật khẩu (chạy trong thư mục mã nguồn đã `npm ci`):

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "MatKhauTamThoi@2026"
```

Rồi chèn tài khoản (username đăng nhập = phần trước `@`, ví dụ `admin`):

```sql
INSERT INTO users (email, full_name, password_hash, role, is_active, must_change_password)
VALUES ('admin@mbbank.com.vn', 'Quản trị hệ thống', '<MÃ BĂM VỪA TẠO>', 'SUPERADMIN', TRUE, TRUE);
```

Lần đăng nhập đầu tiên ứng dụng bắt đổi mật khẩu (`must_change_password = TRUE`).

## 3. Nạp cấu hình và dữ liệu

File schema không mang dữ liệu, kể cả danh mục cấu hình (tiêu chí TTM, rule cảnh báo, ma trận phân quyền, ngày nghỉ,
loại dự án…). Ứng dụng vẫn chạy được khi các bảng cấu hình một dòng (`jira_settings`, `mcp_settings`,
`scoring_engine_settings`, `derived_cache_refresh_lock`…) còn trống — code dùng giá trị mặc định — nhưng chưa tính
được TTM cho tới khi có tiêu chí. Cách chuyển từ môi trường đang chạy:

1. Ở môi trường cũ: **Quản trị → Sao lưu / Phục hồi dữ liệu** → xuất **Smart Export** (lớp dữ liệu bề mặt + 20 bảng
   cấu hình) hoặc **Dump dữ liệu** chọn các bảng cần chuyển (Smart Export không gồm `permission_features`,
   `role_feature_permissions`, `project_types`, `project_type_capabilities` — chọn thêm bằng Dump dữ liệu).
2. Ở môi trường mới: đăng nhập bằng tài khoản ở bước 2 → cùng màn hình → **Import** file vừa xuất.
3. Import là **đồng bộ toàn phần**: dòng nào không có trong file bị xoá ở DB đích. Nếu file có bảng `users`, tài khoản
   tạm ở bước 2 sẽ bị thay bằng danh sách user của môi trường cũ — sau đó đăng nhập bằng tài khoản cũ.
4. Bấm **Tạo lại cache** (Quản trị nguồn dữ liệu) để dựng các bảng cache dẫn xuất.

## 4. Cấu hình ứng dụng trỏ vào DB mới

Trong `.env.local` cạnh mã nguồn (mẫu: `.env.example`):

```dotenv
DB_CONNECTION=local
PGHOST=DB_HOST
PGPORT=5432
PGUSER=ttm_app
PGPASSWORD=...
PGDATABASE=ttm_tool
# hoặc một chuỗi duy nhất (cần TLS thì thêm ?sslmode=require):
# DATABASE_URL_LOCAL=postgres://ttm_app:...@DB_HOST:5432/ttm_tool
IMPORT_API_TOKEN=...   # nếu dùng script Python import tự động
```

## 5. Migration về sau

Bảng `schema_migrations` đã ghi sẵn mọi migration có tới lúc sinh file, nên khi mã nguồn có migration mới chỉ cần:

```bash
node scripts/migrate-db.js --target=local
```

Không chạy `--init` trên DB này (lệnh đó dành cho DB rỗng và bắt đầu bằng `DROP TABLE … CASCADE`).
