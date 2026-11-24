-- 20261204_backfill_sanpham_moi_complexity
-- Bổ sung cho 20261203: migration đó chỉ backfill 2 cụm legacy ('Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới')
-- và so khớp chính xác chữ. `computeEpicComplexity` (epic-complexity.ts) map cả 'Sản phẩm mới' → Sản phẩm (SP) và
-- chuẩn hoá NFC + lower + trim + gom khoảng trắng; migration 20261201 lại đẩy mọi cụm legacy vào ELSE 'CT-Lv12'.
-- Ở đây chuẩn hoá cùng cách (normalize NFC, lower, gom khoảng trắng, trim) cho CẢ 3 cụm legacy, chỉ chạm dòng
-- đang bị gán sai 'CT-Lv12'. Level NULL / 'Chưa xác định' giữ nguyên (R5 sẽ đánh dấu). Chạy lại được nhiều lần.
UPDATE issues
SET epic_complexity_type = CASE WHEN btrim(requirement_level) IN ('1', '2') THEN 'SP-Lv12' ELSE 'SP-Lv34' END
WHERE epic_complexity_type = 'CT-Lv12'
  AND lower(btrim(regexp_replace(normalize(request_type, NFC), '\s+', ' ', 'g')))
      IN ('sản phẩm/dịch vụ/quy trình mới', 'sản phẩm mới', 'phát triển mới')
  AND btrim(requirement_level) IN ('1', '2', '3', '4');
