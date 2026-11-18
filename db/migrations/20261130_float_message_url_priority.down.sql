DROP TABLE IF EXISTS float_message_priorities;
ALTER TABLE float_message_settings DROP CONSTRAINT IF EXISTS float_message_url_length;
ALTER TABLE float_message_settings DROP COLUMN IF EXISTS highlight_border;
ALTER TABLE float_message_settings DROP COLUMN IF EXISTS open_in_new_tab;
ALTER TABLE float_message_settings DROP COLUMN IF EXISTS url;
