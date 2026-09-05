-- Per-campaign auto-dismiss timeout (was a hardcoded 10s in the display component) — see
-- "Quản lý chung" → "Popup quảng cáo"'s form.
ALTER TABLE ad_popups ADD COLUMN IF NOT EXISTS timeout_seconds INT NOT NULL DEFAULT 15 CHECK (timeout_seconds > 0);
