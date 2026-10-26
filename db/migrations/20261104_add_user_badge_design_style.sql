-- User preference for the "Nhận xét" column badge design in Quản trị Epic (owner 2026-10-26):
-- 'list' ("Liệt kê", default for all users) or 'minimal' ("Tối giản", 1x4 grouped box strip).
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_design_style VARCHAR(20) NOT NULL DEFAULT 'list';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_badge_design_style_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_badge_design_style_check
            CHECK (badge_design_style IN ('list', 'minimal'));
    END IF;
END $$;
