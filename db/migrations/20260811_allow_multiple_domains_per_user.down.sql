-- Rollback is only safe when every user has at most one Domain assignment.
ALTER TABLE user_domains
  ADD CONSTRAINT uq_user_domains_user UNIQUE (user_id);
