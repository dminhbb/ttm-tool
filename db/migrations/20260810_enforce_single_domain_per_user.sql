-- Each user belongs to at most one business domain. API validation requires exactly one on create/update.
ALTER TABLE user_domains
  ADD CONSTRAINT uq_user_domains_user UNIQUE (user_id);
