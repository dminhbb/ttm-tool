-- Create api_keys table for external domain login verification / API Key authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_name VARCHAR(255) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_unlimited BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from DATE,
    valid_to DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_api_keys_validity CHECK (is_unlimited = TRUE OR (valid_from IS NOT NULL AND (valid_to IS NULL OR valid_to >= valid_from)))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys (is_active);
