-- Create mcp_settings for the MCP Server feature's single on/off switch (SUPERADMIN-controlled kill
-- switch, off by default until the feature is ready to expose read-only data to external AI clients).
CREATE TABLE IF NOT EXISTS mcp_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_mcp_settings_singleton CHECK (id = 1)
);

INSERT INTO mcp_settings (id, is_enabled)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
