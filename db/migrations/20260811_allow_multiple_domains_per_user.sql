-- This migration must run after 20260810_enforce_single_domain_per_user.sql.
-- User-to-domain is a many-to-many assignment; the composite primary key prevents duplicates.
ALTER TABLE user_domains
  DROP CONSTRAINT IF EXISTS uq_user_domains_user;
