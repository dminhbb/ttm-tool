-- Recreates import_rows EMPTY — the JSON copies are not restored (issues + import_row_issues carry the data).
CREATE TABLE IF NOT EXISTS import_rows (
    id SERIAL PRIMARY KEY,
    import_batch_id INT REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    normalized_data_json TEXT,
    validation_status VARCHAR(50) NOT NULL,
    validation_errors_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
