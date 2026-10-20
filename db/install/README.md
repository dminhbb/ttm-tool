# Cài đặt CSDL mới cho TTM Monitor

Dùng khi đưa ứng dụng lên một môi trường mới (Node.js host + PostgreSQL nội bộ). Kiến trúc và cách chạy
ứng dụng: Tài liệu sản phẩm mục 1.1. Cấu trúc CSDL chi tiết: Tài liệu sản phẩm chương 5 và `docs/database-erd.md`.

| File | Nội dung |
|---|---|
| `ttm-monitor-schema.sql` | Toàn bộ cấu trúc hiện hành: 60 bảng, khoá chính / UNIQUE / CHECK, index, khoá ngoại, 4 hàm + 4 trigger, và tên các migration đã gộp (bảng `schema_migrations`). **Phần 7 tuỳ chọn:** dữ liệu khởi tạo của 19 bảng cấu hình + 1 tài khoản SUPERADMIN ban đầu, bật/tắt bằng một công tắc ở đầu file. Không có dữ liệu nghiệp vụ. |

File được **sinh tự động** bởi `npm run db:export-schema -- --target=supabase` (`scripts/db-schema-export.js`) từ một CSDL
đã chạy đủ migration — không sửa tay. Mỗi khi thêm migration mới (hoặc muốn cập nhật dữ liệu khởi tạo theo cấu hình mới
nhất), chạy lại lệnh đó để file, chương 5 của Tài liệu sản phẩm và `docs/database-erd.md` khớp với CSDL. Thêm `--no-seed`
để sinh file không kèm phần 7.

## 1. Tạo CSDL và chạy file schema

Yêu cầu PostgreSQL 14 trở lên, không cần extension. Ví dụ với `psql`:

```bash
createdb -U postgres ttm_tool
psql "postgres://postgres:MAT_KHAU@DB_HOST:5432/ttm_tool" -v ON_ERROR_STOP=1 -f db/install/ttm-monitor-schema.sql
```

(Hoặc mở file trong pgAdmin / DBeaver và chạy toàn bộ.) Cả file chạy trong một transaction: nếu DB đã có bảng
trùng tên, lệnh dừng ở lỗi đầu tiên và không tạo gì — chỉ dùng cho **database rỗng**.

## 2. Dữ liệu khởi tạo (tuỳ chọn) — công tắc ở đầu file

Ngay sau `BEGIN;` ở đầu file có dòng:

```sql
SELECT set_config('ttm_install.seed_data', 'on', false);
```

| Giá trị | Kết quả |
|---|---|
| `'on'` (mặc định) | Tạo cấu trúc **và** nạp phần 7: ứng dụng chạy được ngay ở trạng thái ban đầu, đăng nhập bằng tài khoản SUPERADMIN ban đầu. |
| `'off'` | Chỉ tạo cấu trúc, mọi bảng trống — dùng khi sẽ phục hồi toàn bộ dữ liệu từ môi trường khác (mục 3) ngay sau đó. |

Phần 7 lấy **nguyên cấu hình hiện hành** của CSDL nguồn lúc sinh file (danh sách bảng ở `scripts/db-schema-catalog.json` → `seed`):

| Nhóm | Bảng |
|---|---|
| Ma trận phân quyền | `permission_features`, `role_feature_permissions` |
| Tiêu chí TTM & rule cảnh báo | `ttm_policy_configs`, `epic_status_alert_rules`, `issue_type_role_mapping`, `ttm_scope_config` |
| Lịch làm việc | `holidays`, `makeup_workdays` |
| Scoring Service | `scoring_engine_settings`, `scoring_parameters`, `scoring_rule_settings` |
| Loại dự án (PMS) | `project_types`, `project_type_capabilities` |
| Cấu hình hệ thống (1 dòng) | `jira_settings`, `data_retention_configs`, `mcp_settings`, `dashboard_view_settings`, `import_admission_settings`, `derived_cache_refresh_lock` |

Cột "người cập nhật" (khoá ngoại tới `users`) được để trống vì DB mới chưa có các user đó; khoá tạo lại cache bắt đầu
ở trạng thái rảnh. **Không** gồm dữ liệu nghiệp vụ: domain, dự án, user (trừ tài khoản ban đầu), Epic / dữ liệu import,
danh sách Black listed và Từ chối import, banner, popup, API key, token MCP.

**Tài khoản SUPERADMIN ban đầu** (chỉ có khi công tắc `'on'`):

| Username đăng nhập | Mật khẩu ban đầu | Ghi chú |
|---|---|---|
| `admin` (email `admin@mbbank.com.vn`) | `Ttm@Admin2026` | Ứng dụng **bắt buộc đổi mật khẩu** ở lần đăng nhập đầu. |

Muốn dùng mật khẩu ban đầu khác: tạo mã băm rồi thay chuỗi `$2b$12$…` trong câu `INSERT INTO users` ở cuối file
(chạy trong thư mục mã nguồn đã `npm ci`):

```bash
node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "MatKhauKhac@2026"
```

Nếu chạy với `'off'` mà vẫn cần một tài khoản để đăng nhập, chèn tay câu `INSERT INTO users …` đó sau khi tạo DB.

## 3. Chuyển dữ liệu từ môi trường đang chạy (khi cần)

1. Ở môi trường cũ: **Quản trị → Sao lưu / Phục hồi dữ liệu** → xuất **Smart Export** (lớp dữ liệu bề mặt + 20 bảng
   cấu hình) hoặc **Dump dữ liệu** chọn các bảng cần chuyển.
2. Ở môi trường mới: đăng nhập (tài khoản `admin` ở mục 2) → cùng màn hình → **Import** file vừa xuất.
3. Import là **đồng bộ toàn phần**: dòng nào không có trong file bị xoá ở DB đích. Nếu file có bảng `users`, tài khoản
   `admin` ban đầu được thay bằng danh sách user của môi trường cũ — sau đó đăng nhập bằng tài khoản cũ.
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
