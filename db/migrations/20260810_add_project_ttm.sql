ALTER TABLE projects
  ADD COLUMN ttm CHAR(1) NOT NULL DEFAULT 'N'
  CHECK (ttm IN ('Y', 'N'));
