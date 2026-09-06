-- Manageable "information banner" (the yellow notice line at the top of a screen) — see
-- "Quản lý chung" → "Banner thông báo". A banner is either DEFAULT (shown on every screen, at most
-- one such row at a time — enforced by the partial unique index below) or PER_SCREEN (shown only
-- on the one screen it's assigned to, via screen_key = a pathname like '/epic-alerts-15'). A screen
-- with no banner of its own just shows the DEFAULT one (if active/in range); both can show together.
CREATE TABLE IF NOT EXISTS info_banners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    banner_type VARCHAR(20) NOT NULL CHECK (banner_type IN ('DEFAULT', 'PER_SCREEN')),
    -- Nullable even for PER_SCREEN: a banner demoted from DEFAULT (see info-banner-service.ts) or
    -- one an admin hasn't assigned a screen to yet just doesn't match any screen until edited.
    screen_key VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_info_banners_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

-- "chỉ có duy nhất 01 banner có tính chất = mặc định" — at most one DEFAULT row at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_info_banners_single_default ON info_banners (banner_type) WHERE banner_type = 'DEFAULT';
