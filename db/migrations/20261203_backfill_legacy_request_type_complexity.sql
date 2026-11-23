-- 20261203_backfill_legacy_request_type_complexity
-- Backfill `issues.epic_complexity_type` cho các Epic có Loại yêu cầu legacy mà từng bị gán nhầm
-- thành `CT-Lv12` (vì `computeEpicComplexity` trước 2026-11-23 chưa map các cụm này sang Sản phẩm).
--
-- Bối cảnh: 3 cụm Loại yêu cầu legacy — 'Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới',
-- 'Sản phẩm mới' — nay được map sang Sản phẩm (SP) ở cả text parser lẫn `computeEpicComplexity`
-- (quyết định 2026-11-23). Dữ liệu cũ đã lưu `epic_complexity_type='CT-Lv12'` nên bị sai loại và,
-- với các dòng Lv3/4, còn sai cả level.
--
-- Phân nhánh theo `requirement_level` (khớp cách `computeEpicComplexity` suy level):
--   * level 1 / 2 → SP-Lv12
--   * level 3 / 4 → SP-Lv34
--   * level NULL / 'Chưa xác định' → GIỮ NGUYÊN (còn là CT-Lv12) — để Scoring Service đánh dấu
--     Sai lệch dữ liệu (R5 — Thiếu Requirement Level) cho tới khi có level thật.
--
-- An toàn: chỉ chạm các dòng có `request_type` thuộc nhóm legacy; các Epic Cải tiến thực sự luôn có
-- `request_type='Cải tiến'` nên không bị đụng (đã kiểm chứng DB 2026-11-23).

-- level 1 / 2 → SP-Lv12
UPDATE issues
SET epic_complexity_type = 'SP-Lv12'
WHERE request_type IN ('Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới')
  AND requirement_level IN ('1', '2');

-- level 3 / 4 → SP-Lv34
UPDATE issues
SET epic_complexity_type = 'SP-Lv34'
WHERE request_type IN ('Sản phẩm/dịch vụ/quy trình mới', 'Phát triển mới')
  AND requirement_level IN ('3', '4');
