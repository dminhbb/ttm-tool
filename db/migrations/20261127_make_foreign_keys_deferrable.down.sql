-- Down: đưa mọi khoá ngoại của schema public về NOT DEFERRABLE (trạng thái trước 20261127_make_foreign_keys_deferrable).
-- Sau khi chạy, import "Quản lý dữ liệu" có thể lỗi khoá ngoại với file nạp bảng con trước bảng cha.

DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT cl.relname AS table_name, c.conname AS constraint_name
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public' AND c.condeferrable
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER CONSTRAINT %I NOT DEFERRABLE', fk.table_name, fk.constraint_name);
    END LOOP;
END $$;
