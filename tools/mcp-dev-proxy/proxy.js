#!/usr/bin/env node
/**
 * MCP Dev Proxy — forward HTTP(S) requests to the internal OCP MCP endpoint
 * with TLS certificate verification disabled (the OCP ingress uses a
 * self-signed cert, and the corporate machine has no admin to install the CA).
 *
 * The corporate proxy is bypassed for *.mbbank.com.vn (NO_PROXY), so this
 * proxy connects directly to the internal endpoint.
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
const http = require('http');
const https = require('https');

const PORT = parseInt(process.argv[2] || process.env.MCP_DEV_PROXY_PORT || '3457', 10);
const TARGET_HOST = 'qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn';
const TARGET_PATH = '/api/mcp';

// Bearer token — read from MCP_DEV_PROXY_TOKEN env var, or a local token file
// (never commit the token). The token file is relative to this script.
const fs = require('fs');
const path = require('path');
const TOKEN_FILE = path.join(__dirname, '.proxy-token');
let TOKEN = process.env.MCP_DEV_PROXY_TOKEN;
if (!TOKEN && fs.existsSync(TOKEN_FILE)) {
  TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

const server = http.createServer((req, res) => {
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
    // Disable TLS verification — the OCP ingress cert is self-signed.
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

server.listen(PORT, () => {
  console.log(`[mcp-dev-proxy] listening on http://localhost:${PORT}`);
  console.log(`[mcp-dev-proxy] forwarding to https://${TARGET_HOST}${TARGET_PATH}`);
  console.log(`[mcp-dev-proxy] TLS verification DISABLED (dev only)`);
});
