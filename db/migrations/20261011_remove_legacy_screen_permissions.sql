-- Migration: gỡ 3 chức năng của các màn hình đã bị loại bỏ khỏi Ma trận phân quyền (2026-10-11):
--   dashboard      — /dashboard   (Dashboard cũ)         → thay bằng TTM Dashboard 2
--   epic_alerts_30 — /epic-alerts (Quản trị Epic 30)      → thay bằng Quản trị Epic (/epic-alerts-15)
--   epic_in_po     — /epic-in-po  (Epic in PO)            → quick filter "Epics in PO" của Quản trị Epic
-- role_feature_permissions có FK ON DELETE CASCADE nhưng xoá tường minh cho rõ ý.
DELETE FROM role_feature_permissions WHERE feature_key IN ('dashboard', 'epic_alerts_30', 'epic_in_po');
DELETE FROM permission_features WHERE feature_key IN ('dashboard', 'epic_alerts_30', 'epic_in_po');
