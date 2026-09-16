-- Create mcp_oauth_authorization_codes: short-lived, single-use codes minted after a logged-in
-- user clicks "Cho phép" on the /api/mcp/oauth/authorize consent screen. client_id is NOT a
-- foreign key into mcp_oauth_clients because it may instead be a Client ID Metadata Document URL
-- (see mcp_oauth_clients.sql) — client_name is captured here at authorize-time so the token
-- endpoint can label the resulting Personal Access Token without re-resolving the client.
CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) NOT NULL UNIQUE,
    client_id VARCHAR(2048) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_code ON mcp_oauth_authorization_codes (code);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires ON mcp_oauth_authorization_codes (expires_at);
