# MCP Dev Proxy

Kết nối Claude Code / VS Code extension tới MCP server **dev** trên OCP nội bộ
(`qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn`) khi gặp 2 rào cản mạng:

1. **Chứng chỉ SSL self-signed** do OpenShift ingress tạo — máy công ty không có
   quyền admin để cài CA vào Windows Trusted Root store.
2. `claude.exe` (native binary) **không tôn trọng** `NODE_TLS_REJECT_UNAUTHORIZED`
   và không có option tắt verify TLS trong `.mcp.json`.

Proxy cục bộ này:
- Lắng nghe trên `http://localhost:3457` (HTTP thuần — không vướng SSL), **chỉ ở `127.0.0.1`** — máy khác trong
  mạng không gọi được proxy (proxy tự chèn token của bạn, nên không được mở ra ngoài).
- Từ chối (403) request có header `Host` khác `localhost:<port>` / `127.0.0.1:<port>` hoặc có `Origin` của một trang
  web không phải localhost — chặn trang web mở trong trình duyệt trên chính máy này (kể cả qua DNS rebinding) mượn
  token. Claude Code / VS Code không gửi `Origin` nên không bị ảnh hưởng.
- Forward mọi request tới `https://qlda-tool...mbbank.com.vn/api/mcp` với
  `rejectUnauthorized: false` (tắt verify TLS, **chỉ cho dev**).
- Tự chèn `Authorization: Bearer <token>` lấy từ file `.proxy-token` (không commit).
- Bỏ qua corporate proxy cho `.mbbank.com.vn` (đã nằm trong `NO_PROXY`).

## Cách dùng

**Bước 1 — Khởi động proxy** (chạy trong một terminal riêng, giữ cửa sổ mở):

```cmd
cd tools\mcp-dev-proxy
start-proxy.cmd
```

hoặc:

```cmd
node proxy.js 3457
```

**Bước 2 — Dùng MCP trong Claude Code / VS Code**:
`.mcp.json` đã trỏ MCP server `ttm-tool-dev` tới `http://localhost:3457/api/mcp`.
Khi proxy đang chạy, server hiện **✓ Connected**.

> Lưu ý: Nếu chưa mở proxy, server `ttm-tool-dev` sẽ báo "Failed to connect".
> Chỉ cần mở proxy rồi dùng lại.

## Cấu hình

- **Port**: đổi bằng `node proxy.js <port>` hoặc biến env `MCP_DEV_PROXY_PORT`.
- **Token**: ghi vào `tools/mcp-dev-proxy/.proxy-token` (đã có `.gitignore`), hoặc
  biến env `MCP_DEV_PROXY_TOKEN`. Token này KHÔNG được commit.
- **Endpoint đích**: sửa hằng số `TARGET_HOST` / `TARGET_PATH` trong `proxy.js`.

## Bảo mật

- `rejectUnauthorized: false` vô hiệu hóa xác minh chứng chỉ cho **proxy này** —
  chỉ dùng cho dev, không bao giờ đưa lên production.
- Token nằm trong file `.proxy-token` local, không nằm trong `.mcp.json` hoặc git.
