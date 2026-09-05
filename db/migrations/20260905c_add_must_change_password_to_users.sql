ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

-- Set must_change_password = TRUE for all existing users except minhnd7@mbbank.com.vn
UPDATE users SET must_change_password = TRUE WHERE LOWER(email) <> 'minhnd7@mbbank.com.vn';
UPDATE users SET must_change_password = FALSE WHERE LOWER(email) = 'minhnd7@mbbank.com.vn';
