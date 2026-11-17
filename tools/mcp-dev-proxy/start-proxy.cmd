@echo off
REM ============================================================
REM  Start the MCP dev proxy (forward to internal OCP endpoint).
REM  Run this whenever you want to use the "ttm-tool-dev" MCP
REM  server in Claude Code / VS Code. Keep the window open.
REM ============================================================
cd /d "%~dp0"
echo Starting MCP dev proxy on http://localhost:3457 ...
echo Forwarding to https://qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn/api/mcp
echo TLS verification DISABLED (dev only). Press Ctrl+C to stop.
echo.
node proxy.js 3457
pause
