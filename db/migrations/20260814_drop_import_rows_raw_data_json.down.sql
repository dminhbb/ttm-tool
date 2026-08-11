-- Restores the column (empty going forward — historical duplicate content is not recoverable).
ALTER TABLE import_rows ADD COLUMN IF NOT EXISTS raw_data_json TEXT;
UPDATE import_rows SET raw_data_json = normalized_data_json WHERE raw_data_json IS NULL;
ALTER TABLE import_rows ALTER COLUMN raw_data_json SET NOT NULL;
