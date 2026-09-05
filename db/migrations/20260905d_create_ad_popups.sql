-- "AD Popup" — promotional popups shown to users after login, configured by SUPERADMIN only
-- (see "Quản lý chung" → "Popup quảng cáo"). ad_popup_impressions tracks how many times each user
-- has actually been shown a given popup, so the per-user max-impressions cap can be enforced.
CREATE TABLE IF NOT EXISTS ad_popups (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_impressions INT NOT NULL DEFAULT 2 CHECK (max_impressions > 0),
    message TEXT NOT NULL,
    image_url VARCHAR(500),
    click_url VARCHAR(500),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ad_popups_date_range CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS ad_popup_impressions (
    popup_id INT NOT NULL REFERENCES ad_popups(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shown_count INT NOT NULL DEFAULT 0,
    last_shown_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (popup_id, user_id)
);
