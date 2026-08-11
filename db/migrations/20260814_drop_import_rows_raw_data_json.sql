-- raw_data_json was being written with the exact same content as normalized_data_json
-- on every import (verbatim duplicate), doubling import_rows storage for no benefit.
-- normalized_data_json is the copy every read path actually relies on; drop the other.
ALTER TABLE import_rows DROP COLUMN IF EXISTS raw_data_json;
