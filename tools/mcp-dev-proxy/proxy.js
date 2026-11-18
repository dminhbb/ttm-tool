#!/usr/bin/env node
/**
 * MCP Dev Proxy — forward HTTP(S) requests to an internal MCP endpoint
 * with TLS certificate verification disabled (when the internal ingress uses a
 * self-signed cert and the corporate machine has no admin to install the CA).
 *
 * Usage:
 *   node proxy.js [port]            # default port 3457
 *
 * Configure in .mcp.json:
 *   {
 *     "mcpServers": {
 *       "ttm-tool-dev": {
 *         "type": "http",
 *         "url": "http://localhost:3457/api/mcp",
 *         "headers": { "Authorization": "Bearer {{MCP_TTM_TOOL_DEV_TOKEN}}" }
 *       }
 *     }
 *   }
 *
 * NOTE: This disables TLS verification for this proxy only. Use in dev only.
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const PORT = parseInt(process.argv[2] || process.env.MCP_DEV_PROXY_PORT || '3457', 10);
const TARGET_PATH = '/api/mcp';

// Target host — read from MCP_DEV_PROXY_TARGET_HOST env var, or a local .proxy-target file
// (never commit internal hostnames to the public GitHub repository).
const TARGET_FILE = path.join(__dirname, '.proxy-target');
let TARGET_HOST = (process.env.MCP_DEV_PROXY_TARGET_HOST || '').trim();
if (!TARGET_HOST && fs.existsSync(TARGET_FILE)) {
  TARGET_HOST = fs.readFileSync(TARGET_FILE, 'utf8').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}
if (!TARGET_HOST) {
  console.error('[mcp-dev-proxy] Missing target host. Set MCP_DEV_PROXY_TARGET_HOST or write the hostname into tools/mcp-dev-proxy/.proxy-target');
  process.exit(1);
}

// Bearer token — read from MCP_DEV_PROXY_TOKEN env var, or a local token file
// (never commit the token). The token file is relative to this script.
const TOKEN_FILE = path.join(__dirname, '.proxy-token');
let TOKEN = process.env.MCP_DEV_PROXY_TOKEN;
if (!TOKEN && fs.existsSync(TOKEN_FILE)) {
  TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

const LISTEN_HOST = '127.0.0.1';
const LOCAL_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

/**
 * Only local MCP clients (Claude Code / VS Code) may use the token this proxy injects. A web page open in the browser of
 * this machine can still reach 127.0.0.1 — directly or through DNS rebinding — so a request must name the proxy itself
 * as Host, and a request carrying an Origin (browsers send one, MCP clients do not) must come from a local page.
 */
function isLocalClientRequest(req) {
  const host = (req.headers.host || '').toLowerCase();
  if (!LOCAL_HOSTS.has(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  if (!isLocalClientRequest(req)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'mcp-dev-proxy: only local MCP clients are allowed' }, id: null }));
    return;
  }

  // Build request options to the internal MCP endpoint
  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: TARGET_PATH,
    method: req.method,
    headers: {
      ...req.headers,
      // Host must match the internal endpoint; drop any inbound host header
      host: TARGET_HOST,
    },
    // Disable TLS verification — the internal ingress cert is self-signed.
    // Dev only. Do NOT ship this to production.
    rejectUnauthorized: false,
  };

  // Inject the Authorization header if a token is configured (and not already present)
  if (TOKEN && !req.headers.authorization) {
    options.headers.authorization = `Bearer ${TOKEN}`;
  }

  // Remove hop-by-hop headers that must not be forwarded
  ['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding'].forEach(
    (h) => delete options.headers[h]
  );

  const upstream = https.request(options, (upRes) => {
    // Forward the status and headers back to the client
    const outHeaders = { ...upRes.headers };
    delete outHeaders['transfer-encoding'];
    res.writeHead(upRes.statusCode || 502, outHeaders);

    // Pipe the response body (SSE streams work fine through this)
    upRes.pipe(res);
  });

  upstream.on('error', (err) => {
    console.error(`[mcp-dev-proxy] upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: err.message }, id: null }));
  });

  // Pipe the client request body to upstream
  req.pipe(upstream);
});

// Loopback only: the proxy adds the developer's bearer token to every request, so listening on every interface (the
// Node default) would let any machine on the network use the MCP server in the developer's name.
server.listen(PORT, LISTEN_HOST, () => {
  console.log(`[mcp-dev-proxy] listening on http://localhost:${PORT} (${LISTEN_HOST} only)`);
  console.log(`[mcp-dev-proxy] forwarding to https://${TARGET_HOST}${TARGET_PATH}`);
  console.log(`[mcp-dev-proxy] TLS verification DISABLED (dev only)`);
});
