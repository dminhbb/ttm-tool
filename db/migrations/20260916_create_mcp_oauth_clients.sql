-- Create mcp_oauth_clients: OAuth clients registered against the MCP authorization server via
-- Dynamic Client Registration (RFC 7591) — public clients only (no secret; PKCE is the actual
-- proof of possession). Clients using the "Client ID Metadata Document" pattern (client_id itself
-- a URL, e.g. claude.ai's hosted client metadata) never register here — they're resolved live by
-- fetching that URL instead, see resolveOAuthClient() in mcp-oauth-service.ts.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL UNIQUE,
    client_name VARCHAR(255) NOT NULL,
    redirect_uris JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
