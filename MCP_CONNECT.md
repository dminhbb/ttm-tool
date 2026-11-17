# Kết nối MCP Server của ttm-tool vào AI chatbot của bạn

Hướng dẫn dành cho **người dùng nội bộ** muốn kết nối AI chatbot (Claude Code, Claude Desktop,
Cursor, VSCode Copilot, ChatGPT, Gemini...) tới **MCP Server** của ttm-tool để tra cứu dữ liệu
TTM bằng hội thoại, thay vì phải vào giao diện web.

**Bạn KHÔNG cần source code của ứng dụng.** Bạn chỉ cần 3 thứ:
1. **Địa chỉ MCP** (URL) — cho sẵn ở mục 1.
2. **Personal Access Token** — do chính bạn tự tạo trên giao diện ứng dụng (mục 2).
3. **Cách xử lý chứng chỉ TLS** — mục 3 (vì server dùng chứng chỉ tự ký).

AI chatbot sẽ chỉ nhìn thấy đúng dữ liệu theo **phân quyền của tài khoản bạn** — không thêm quyền nào.

---

## 0. Điều kiện tiên quyết

- Bạn nằm trong **mạng nội bộ** (VPN / corporate network) để truy cập được máy chủ dev.
- **SUPERADMIN** đã bật tính năng **MCP Server** trong *Quản trị hệ thống → MCP Server*.
  Nếu chưa bật, mọi kết nối đều bị từ chối với mã 503.
- Môi trường bạn cần kết nối (dev / uat) có địa chỉ khác nhau — xem mục 1.

---

## 1. Địa chỉ MCP (URL)

MCP Server là một endpoint HTTP chuẩn (streamable HTTP) của chính ứng dụng, nằm tại đường dẫn
`/api/mcp`. Chọn đúng môi trường:

| Môi trường | Địa chỉ MCP (thay `<token>` ở bước cấu hình) |
|---|---|
| **Dev (nội bộ OCP)** | `https://qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn/api/mcp` |
| **UAT** | `https://ttm-monitor-uat.apps.ocp.mbbank.com.vn/api/mcp` |

> Xác minh nhanh: gọi thử bằng `curl` (bỏ `-k` nếu bạn đã cài CA như mục 3):
> ```bash
> curl -k https://<ĐỊA_CHỈ_MCP> \
>   -H "Authorization: Bearer <TOKEN_CỦA_BẠN>" \
>   -H "Content-Type: application/json" \
>   -H "Accept: application/json, text/event-stream" \
>   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
> ```
> Thành công khi thấy phản hồi chứa `"serverInfo":{"name":"ttm-tool"` (HTTP 200).

---

## 2. Tạo Personal Access Token (trên giao diện, không cần source)

1. Đăng nhập vào ứng dụng ttm-tool (web) với tài khoản của bạn.
2. Vào **Thông tin người dùng** → mục **Personal Access Token (kết nối AI chatbot qua MCP)**.
3. Đặt **Tên token** (ví dụ: *Claude Code laptop*, *ChatGPT*...) rồi bấm **Tạo token**.
4. **Sao chép ngay token hiển thị** — nó **chỉ hiện đúng 1 lần**, đóng thông báo là không xem lại được.
   - Token này chính là giá trị bạn dán vào mục `Authorization: Bearer <token>` ở mọi cấu hình bên dưới.
   - Bạn có thể tạo nhiều token (một token cho mỗi thiết bị/ứng dụng) và **Thu hồi** bất kỳ lúc nào để
     chặn ngay quyền truy cập của token đó.

> **Bảo mật:** Không chia sẻ token với người khác. Token mang đúng quyền hạn của bạn và cho phép
> đọc dữ liệu TTM của bạn. Nếu nghi ngờ lộ, hãy thu hồi ngay trên màn hình.

---

## 3. Xử lý chứng chỉ TLS (bắt buộc — server dùng chứng chỉ tự ký)

Máy chủ dev của ttm-tool dùng **chứng chỉ tự ký** (self-signed, do OpenShift ingress tạo). Các AI client
mặc định sẽ **từ chối** kết nối vì không tin chứng chỉ này. Bạn xử lý theo **một** trong hai cách sau —
**ưu tiên Cách A** vì giữ được xác thực (an toàn hơn):

### Cách A (khuyến nghị) — Thêm CA tự ký, GIỮ xác thực TLS

Xuất chứng chỉ của máy chủ về một file `.pem` (chỉ 1 lệnh, không cần quyền admin, không cần source):

**Windows / Linux / macOS** (cần `openssl` — thường có sẵn trong Git Bash, WSL, hoặc `brew install openssl`):
```bash
openssl s_client \
  -connect qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn:443 \
  -servername qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn \
  -showcerts </dev/null 2>/dev/null \
  | openssl x509 -out mcp-server-cert.pem
```
- Tạo file `mcp-server-cert.pem` ngay trong thư mục làm việc.
- Đặt biến môi trường `NODE_EXTRA_CA_CERTS` trỏ tới file này **trước khi khởi động** AI client
  (client dựa trên Node.js sẽ đọc thêm CA này mà vẫn xác thực đúng server):
  - **PowerShell:** `setx NODE_EXTRA_CA_CERTS "C:\path\to\mcp-server-cert.pem"` rồi mở lại terminal.
  - **bash:** `export NODE_EXTRA_CA_CERTS=/path/to/mcp-server-cert.pem`
- Các client không phải Node.js (vd. vài bản Cursor/IDE) có thể có cách nhập CA riêng — tham khảo tài liệu client đó.

> Nếu ứng dụng cung cấp sẵn nút **tải chứng chỉ** trên màn hình cấu hình MCP, bạn có thể tải trực tiếp
> file cert từ đó thay vì chạy lệnh `openssl` trên.

### Cách B (dự phòng) — Tắt xác thực TLS (KHÔNG khuyến nghị)

Chỉ dùng khi client của bạn **không đọc được** `NODE_EXTRA_CA_CERTS` và bạn chấp nhận rủi ro.
Đặt biến môi trường **trước khi khởi động** client:

```bash
# bash / Linux / macOS
export NODE_TLS_REJECT_UNAUTHORIZED=0
```
```powershell
# PowerShell (Windows)
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
```

> ⚠️ **Cảnh báo:** Cách này **tắt hoàn toàn** việc xác minh chứng chỉ, khiến kết nối dễ bị tấn công
> "man-in-the-middle" trên mạng nội bộ. Chỉ dùng tạm để kiểm tra, không nên để mặc định lâu dài.

---

## 4. Cấu hình từng AI client

Với mỗi client, bạn dán **Địa chỉ MCP** (mục 1) + **token của bạn** (mục 2). Lưu ý phần
`Authorization` phải đúng chuỗi `Bearer <token>`.

### 4.1 Claude Code (CLI) — `.mcp.json`

Thêm server vào file cấu hình MCP **project scope** (`.mcp.json` ở thư mục dự án) hoặc **user scope**
(`~/.claude.json` / `claude mcp add`):

```json
{
  "mcpServers": {
    "ttm-tool": {
      "type": "http",
      "url": "https://qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn/api/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN_CỦA_BẠN>"
      }
    }
  }
}
```

- Thay `<TOKEN_CỦA_BẠN>` bằng token thật (bước 2).
- Trước khi chạy `claude`, đảm bảo đã đặt biến môi trường TLS theo mục 3 (Cách A hoặc B).
- Kiểm tra: `claude mcp list` — server `ttm-tool` báo **✓ Connected**.

### 4.2 Claude Desktop — `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ttm-tool": {
      "type": "http",
      "url": "https://qlda-tool.apps.dc01-ocp-vm01a-vcf-dev.mbbank.com.vn/api/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN_CỦA_BẠN>"
      }
    }
  }
}
```

### 4.3 Cursor

Trong **Settings → MCP** thêm server mới:
- **Type:** `http`
- **URL:** địa chỉ MCP (mục 1)
- **Headers:** thêm `Authorization` = `Bearer <TOKEN_CỦA_BẠN>`

(Nếu Cursor/IDE không đọc `NODE_EXTRA_CA_CERTS`, hãy nhập CA trực tiếp trong cài đặt chứng chỉ của
client, hoặc dùng Cách B.)

### 4.4 VS Code + GitHub Copilot (hoặc extension MCP khác)

- Cấu hình MCP server trong VS Code (qua extension MCP hoặc `devcontainer.json`/settings) với
  `"type": "http"`, `url`, và `headers.Authorization` tương tự như trên.
- Đặt biến môi trường TLS (mục 3) trước khi mở VS Code.

### 4.5 ChatGPT / Gemini / Copilot (khác)

Bất kỳ client nào hỗ trợ **HTTP (streamable) MCP** đều dùng được cùng công thức:
- **Type:** `http` / `streamable-http`
- **URL:** địa chỉ MCP
- **Headers:** `Authorization: Bearer <TOKEN_CỦA_BẠN>`

---

## 5. Ví dụ hội thoại sau khi kết nối

Khi đã kết nối, bạn có thể hỏi AI kiểu:
- *"Liệt kê các Epic đang bị cảnh báo FAIL TTM của tôi."*
- *"Epic ABC-123 đang ở trạng thái gì, trễ bao nhiêu ngày?"*
- *"Dự án X có bao nhiêu Epic đạt TTM-CNTT?"*

AI sẽ gọi các công cụ MCP của ttm-tool (`get_ttm_dashboard`, `list_epic_alerts`,
`get_epic_detail`, `get_alert_logic`...) và trả lời dựa trên dữ liệu thực tế mà bạn có quyền xem.

---

## 6. Xử lý sự cố

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| **401** `Thiếu hoặc sai định dạng Authorization` | Header `Authorization` chưa đúng chuỗi `Bearer <token>`, hoặc thiếu. |
| **401** `Personal Access Token không hợp lệ hoặc đã bị thu hồi` | Token sai/đã thu hồi → tạo token mới ở mục 2. |
| **503** `MCP Server hiện đang tắt` | SUPERADMIN chưa bật MCP Server trong Quản trị hệ thống. |
| **503** `Hệ thống đang tạm dừng` | Hệ thống đang trong chế độ tạm dừng (trừ khi có ngoại lệ MCP). |
| **Lỗi chứng chỉ / self-signed / unable to verify** | Chưa xử lý TLS — làm theo mục 3 (Cách A hoặc B). |
| **Không kết nối được / timeout** | Kiểm tra bạn đang trong mạng nội bộ/VPN và đúng địa chỉ môi trường. |
| **Server `ttm-tool` báo Failed to connect** | Xem các dòng trên; thường nhất là thiếu biến env TLS (mục 3). |

---

## 7. Ghi chú kiến trúc (dành cho người quản trị)

- MCP Server là **một phần của ứng dụng** (`src/app/api/mcp/route.ts`), transport
  **WebStandardStreamableHTTP**, không cần thêm hạ tầng.
- Mỗi HTTP request xác thực bằng Personal Access Token của người gọi và dựng MCP server riêng theo
  đúng phân quyền của người đó — trạng thái được xây lại mỗi request (Vercel/function không giữ process).
- **Không cần chia sẻ token**: mỗi user tự tạo token của mình; việc tạo/thu hồi nằm trong tay từng người.
- Proxy cục bộ `tools/mcp-dev-proxy/proxy.js` trong repo **chỉ là cách vượt TLS của riêng máy dev** —
  nó không phải điều kiện bắt buộc. User không có source có thể kết nối thẳng HTTPS như hướng dẫn trên.
