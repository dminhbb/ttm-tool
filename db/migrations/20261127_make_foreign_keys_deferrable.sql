-- Mọi khoá ngoại của schema public thành DEFERRABLE INITIALLY IMMEDIATE (2026-11-12).
--
-- Vì sao: import "Quản lý dữ liệu" (src/lib/db-backup-service.ts importSqlFile) trước đây chạy
-- ALTER TABLE … DISABLE TRIGGER ALL để nạp bảng không theo thứ tự khoá ngoại. Lệnh đó tắt cả trigger hệ thống
-- RI_ConstraintTrigger_* nên cần superuser — trên DB mà user ứng dụng không phải superuser, import lỗi
-- "permission denied: "RI_ConstraintTrigger_a_…" is a system trigger". Nay import chạy SET CONSTRAINTS ALL DEFERRED
-- (không cần superuser), chỉ có tác dụng với khoá ngoại DEFERRABLE.
--
-- INITIALLY IMMEDIATE: mọi câu lệnh khác của ứng dụng vẫn bị kiểm tra ngay như cũ — chỉ transaction nào tự gọi
-- SET CONSTRAINTS … DEFERRED mới dời việc kiểm tra về cuối. Khoá ngoại thêm sau migration này phải khai báo
-- DEFERRABLE INITIALLY IMMEDIATE (src/lib/__tests__/db-import-order.test.ts kiểm tra).

DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT cl.relname AS table_name, c.conname AS constraint_name
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND NOT c.condeferrable
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE', fk.table_name, fk.constraint_name);
    END LOOP;
END $$;
