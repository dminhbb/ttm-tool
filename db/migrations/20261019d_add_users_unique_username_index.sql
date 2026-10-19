-- Enforce unique username (local-part of email, lowercase) across all users (active and inactive).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_username
    ON users (SPLIT_PART(LOWER(email), '@', 1));
