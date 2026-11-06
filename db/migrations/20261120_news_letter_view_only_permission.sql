-- "Bản tin" sits in the "Chức năng khác" block of Ma trận phân quyền (category VIEW_ONLY): only "Xem" applies there.
-- Migration 20261119 seeded SUPERADMIN with Thêm/Sửa/Xóa = TRUE, which the matrix rejects on save for a VIEW_ONLY
-- feature. Writing articles stays SUPERADMIN-only, enforced by the Bản tin API itself (2026-11-06).
UPDATE role_feature_permissions SET can_add = FALSE, can_edit = FALSE, can_delete = FALSE WHERE feature_key = 'news_letter';
