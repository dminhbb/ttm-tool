-- Phân loại Epic: tính lại issues.epic_complexity_type ĐÚNG như code (src/lib/epic-complexity.ts computeEpicComplexity),
-- chủ sản phẩm 2026-11-26 (REQ-20261126-02).
--
-- Vì sao: 20261201 / 20261203 / 20261204 chuẩn hoá khác code (không NFC, không gộp khoảng trắng, không trim Level; chỉ
-- backfill Level 1–4). Đo trên Supabase 26/11: 47 Epic lưu CT-Lv12 trong khi code tính SP-Lv12 — Loại yêu cầu cũ
-- ("Sản phẩm/dịch vụ/quy trình mới", "Phát triển mới") với Level TRỐNG. Chủ sản phẩm chốt: các Epic đó là
-- "Phân loại sai Epic" (SP-Lv12) và bị rule R6 loại khỏi việc chấm Đạt / Fail. Lần import sau code cũng cho đúng kết quả
-- này, nên dữ liệu cũ và mới không còn lệch nhau.
--
-- Quy tắc (giống hệt code): Loại yêu cầu & Level đều NFC + gộp khoảng trắng + trim + chữ thường; Loại yêu cầu → mã
-- (Cải tiến CT, Tính năng mới TNM, Sản phẩm SP, Hệ thống mới HTM, Quy trình QT, Dịch vụ DV, Giải pháp nền tảng GPNT;
-- legacy "Sản phẩm/dịch vụ/quy trình mới" / "Sản phẩm mới" / "Phát triển mới" → SP; trống / khác → CT); Level 3 hoặc 4
-- → Lv34, còn lại (kể cả trống) → Lv12. Chỉ dòng có epic_complexity_type (dòng Epic) và chỉ dòng đang khác kết quả.
-- Sau migration: cache dẫn xuất được tạo lại ở lần tạo cache kế tiếp (SCORING_CODE_VERSION cũng đã đổi).
WITH normalized AS (
  SELECT id,
    lower(btrim(regexp_replace(normalize(coalesce(request_type, ''), NFC), '\s+', ' ', 'g'))) AS type_n,
    lower(btrim(regexp_replace(normalize(coalesce(requirement_level, ''), NFC), '\s+', ' ', 'g'))) AS level_n
  FROM issues
  WHERE epic_complexity_type IS NOT NULL
),
computed AS (
  SELECT id,
    (CASE type_n
       WHEN 'cải tiến' THEN 'CT'
       WHEN 'tính năng mới' THEN 'TNM'
       WHEN 'sản phẩm' THEN 'SP'
       WHEN 'hệ thống mới' THEN 'HTM'
       WHEN 'quy trình' THEN 'QT'
       WHEN 'dịch vụ' THEN 'DV'
       WHEN 'giải pháp nền tảng' THEN 'GPNT'
       WHEN 'sản phẩm/dịch vụ/quy trình mới' THEN 'SP'
       WHEN 'sản phẩm mới' THEN 'SP'
       WHEN 'phát triển mới' THEN 'SP'
       ELSE 'CT'
     END) || '-' || (CASE WHEN level_n IN ('3', '4') THEN 'Lv34' ELSE 'Lv12' END) AS complexity
  FROM normalized
)
UPDATE issues AS i
SET epic_complexity_type = c.complexity
FROM computed AS c
WHERE i.id = c.id
  AND i.epic_complexity_type IS DISTINCT FROM c.complexity;
