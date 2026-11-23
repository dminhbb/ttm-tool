-- Reverse 20261203_backfill_legacy_request_type_complexity.sql: đổi lại `epic_complexity_type`
-- về giá trị cũ `CT-Lv12` cho đúng các dòng migration up đã backfill (level 1/2 → SP-Lv12,
-- level 3/4 → SP-Lv34). Các dòng level NULL / 'Chưa xác định' không bị up chạm nên không đổi lại.
--
-- Điều kiện khóa theo `request_type` nhóm legacy + `requirement_level` tương ứng, nên chỉ đảo đúng
-- các dòng do migration này thay đổi, không đụng Epic khác.

-- SP-Lv12 (level 1/2) → CT-Lv12
UPDATE issues
SET epic_complexity_type = 'CT-Lv12'
WHERE request_type IN ('Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới')
  AND requirement_level IN ('1', '2')
  AND epic_complexity_type = 'SP-Lv12';

-- SP-Lv34 (level 3/4) → CT-Lv12
UPDATE issues
SET epic_complexity_type = 'CT-Lv12'
WHERE request_type IN ('Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới')
  AND requirement_level IN ('3', '4')
  AND epic_complexity_type = 'SP-Lv34';
