-- Create mcp_access_tokens: one row per Personal Access Token a user issues themselves to let an
-- external AI chatbot (Claude, ChatGPT, Gemini, Copilot, ...) call this app's MCP server under
-- their own identity and existing RBAC — never a shared app-level secret like api_keys.
CREATE TABLE IF NOT EXISTS mcp_access_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_name VARCHAR(255) NOT NULL,
    token_prefix VARCHAR(32) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user ON mcp_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_hash ON mcp_access_tokens (token_hash);
