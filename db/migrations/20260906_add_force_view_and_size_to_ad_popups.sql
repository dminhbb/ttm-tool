-- "Bắt buộc xem" (force_view) — when true, the popup never auto-dismisses and hides its X button
-- until the timeout elapses (then the X appears so the user can close it manually). When false
-- (default), unchanged from before: auto-dismiss after timeout_seconds, X always visible.
-- width_percent/height_percent (nullable — NULL means "use the default size") let an admin force a
-- specific size, as a percentage of the viewport.
ALTER TABLE ad_popups ADD COLUMN IF NOT EXISTS force_view BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ad_popups ADD COLUMN IF NOT EXISTS width_percent INT CHECK (width_percent IS NULL OR (width_percent BETWEEN 1 AND 100));
ALTER TABLE ad_popups ADD COLUMN IF NOT EXISTS height_percent INT CHECK (height_percent IS NULL OR (height_percent BETWEEN 1 AND 100));
