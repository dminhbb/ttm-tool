-- Reverse 20261204: đưa lại CT-Lv12 cho các dòng legacy (3 cụm) mà migration up đã đổi sang SP-Lv12 / SP-Lv34.
-- Lưu ý: dòng 2 cụm đã được 20261203 backfill cũng bị đổi lại (không phân biệt được) — chạy lại 20261203 nếu cần.
UPDATE issues
SET epic_complexity_type = 'CT-Lv12'
WHERE epic_complexity_type IN ('SP-Lv12', 'SP-Lv34')
  AND lower(btrim(regexp_replace(normalize(request_type, NFC), '\s+', ' ', 'g')))
      IN ('sản phẩm/dịch vụ/quy trình mới', 'sản phẩm mới', 'phát triển mới');
