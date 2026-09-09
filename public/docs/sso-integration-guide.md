# Hướng dẫn Triển khai SSO Authentication cho Ứng dụng B (AI Agent & Developer Guide)

> **Tài liệu chuẩn hóa kiến trúc Đăng nhập tập trung (Single Sign-On - OAuth 2.0 Authorization Code Flow)**
> 
> Hướng dẫn này dành cho **AI Agent** hoặc **Lập trình viên** phát triển bất kỳ ứng dụng nào khác (Ứng dụng B) cần tích hợp chức năng xác thực người dùng qua hệ thống **`ttm-tool`**.

---

## 1. Tổng quan Kiến trúc

Luồng đăng nhập SSO sử dụng chuẩn **OAuth 2.0 Authorization Code Flow**. Điểm cốt lõi của kiến trúc này là:
* **Tuyệt đối An toàn Mật khẩu:** Ứng dụng B **không bao giờ nhìn thấy hoặc nhận mật khẩu** của người dùng. Người dùng chỉ nhập mật khẩu trực tiếp trên giao diện chính chủ của `ttm-tool`.
* **Mã Xác thực 1 lần (Single-use Authorization Code):** Sau khi đăng nhập đúng, `ttm-tool` cấp 1 mã `code` ngắn hạn (**hạn 5 phút, chỉ dùng 1 lần**). Backend Ứng dụng B đổi mã này lấy thông tin User Profile.

```
+---------------+              +--------------------+              +----------------------+
|  Người dùng   |              |   Ứng dụng B       |              |  ttm-tool SSO Server |
+---------------+              +--------------------+              +----------------------+
        |                                |                                    |
        | --- 1. Bấm Đăng nhập SSO ----> |                                    |
        |                                | --- 2. Redirect sang /sso/authorize ->
        | <================ 3. Nhập mật khẩu tại ttm-tool ==================> |
        |                                |                                    |
        | <--- 4. Redirect về app với ?code=ttm_ac_xxx ---------------------- |
        |                                |                                    |
        |                                | --- 5. POST /api/sso/token (code) ->
        |                                | <--- 6. Trả về User Profile + Token -
        | <--- 7. Đăng nhập thành công --|                                    |
```

---

## 2. Quy trình Tích hợp 4 Bước

### Bước 1: Đăng ký & Lấy API Key (`client_id`)
1. Đăng nhập `ttm-tool` bằng tài khoản `SUPERADMIN`.
2. Mở **Quản trị hệ thống** -> chọn **Quản lý API Key**.
3. Bấm **Thêm API Key mới**:
   - **Tên API key**: Đặt tên gợi nhớ (ví dụ: `App B Production Key`).
   - **Ứng dụng**: Nhập tên Ứng dụng B (ví dụ: `Hệ thống Quản lý Dự án B`).
   - **Thời gian áp dụng**: Để mặc định *Không giới hạn* hoặc cài đặt ngày hiệu lực.
4. Copy mã **API Key** sinh ra (dạng `ttm_ak_...`). Mã này đóng vai trò vừa là `client_id` vừa là secret key của Ứng dụng B.

---

### Bước 2: Chuyển hướng người dùng sang `ttm-tool` (Front-End Ứng dụng B)
Khi người dùng chọn nút **"Đăng nhập bằng TTM Account"** trên Ứng dụng B, điều hướng trình duyệt (Browser Redirect) sang đường dẫn:

```http
GET https://<TTM_TOOL_DOMAIN>/sso/authorize?client_id={YOUR_API_KEY}&redirect_uri={YOUR_CALLBACK_URL}&state={CSRF_STATE}
```

**Cấu trúc Tham số:**
| Tham số | Bắt buộc | Mô tả |
| :--- | :---: | :--- |
| `client_id` | **Có** | Mã API Key của Ứng dụng B (ví dụ: `ttm_ak_xxxx`). |
| `redirect_uri` | **Có** | URL trên Ứng dụng B mà `ttm-tool` sẽ redirect quay về sau khi đăng nhập (ví dụ: `https://app-b.com/auth/callback`). |
| `state` | Không | Chuỗi ngẫu nhiên do Ứng dụng B tạo ra để chống tấn công CSRF. |

---

### Bước 3: Tiếp nhận Authorization Code tại Callback Route (Backend Ứng dụng B)
Sau khi người dùng đăng nhập thành công tại `ttm-tool`, `ttm-tool` sẽ redirect trình duyệt quay lại Ứng dụng B theo URL:

```http
GET https://app-b.com/auth/callback?code=ttm_ac_1234567890abcdef&state={CSRF_STATE}
```

* **Lưu ý:** Backend Ứng dụng B phải hứng lấy tham số `code` từ URL query string.

---

### Bước 4: Đổi Code lấy User Profile (Backend Ứng dụng B -> `ttm-tool`)
Backend của Ứng dụng B gọi ngầm (Server-to-Server) sang API của `ttm-tool`:

* **HTTP Method:** `POST`
* **URL:** `https://<TTM_TOOL_DOMAIN>/api/sso/token`
* **Headers:**
  ```http
  Content-Type: application/json
  X-API-Key: <YOUR_API_KEY>
  ```
* **Request Body (JSON):**
  ```json
  {
    "code": "ttm_ac_1234567890abcdef",
    "api_key": "<YOUR_API_KEY>"
  }
  ```

#### Output khi Thành công (`200 OK`):
```json
{
  "success": true,
  "appName": "Hệ thống Quản lý Dự án B",
  "user": {
    "id": 15,
    "email": "user.name@mbbank.com.vn",
    "fullName": "Nguyễn Văn A",
    "role": "ADMIN"
  },
  "accessToken": "ttm_at_1741512345_15",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

Sau khi nhận được `user` profile ở trên, Ứng dụng B tạo phiên đăng nhập (Session / JWT / Cookie) cho người dùng trên hệ thống của mình.

---

## 3. Sample Code Mẫu cho các Ngôn ngữ / Framework

### A. Node.js / Express / Next.js (Backend Callback)
```javascript
// Express.js route handler: GET /auth/callback
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const API_KEY = process.env.TTM_API_KEY; // 'ttm_ak_...'
  const TTM_DOMAIN = process.env.TTM_TOOL_DOMAIN; // 'https://ttm.company.com'

  if (!code) {
    return res.status(400).send('Không nhận được authorization code');
  }

  try {
    // Exchange code for user profile
    const tokenRes = await fetch(`${TTM_DOMAIN}/api/sso/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ code, api_key: API_KEY }),
    });

    const data = await tokenRes.json();
    if (!data.success) {
      return res.status(401).send(`Đăng nhập SSO thất bại: ${data.message}`);
    }

    // Save session in App B
    req.session.user = data.user;
    return res.redirect('/dashboard');
  } catch (error) {
    return res.status(500).send('Lỗi kết nối máy chủ SSO');
  }
});
```

---

### B. Python / FastAPI / Django
```python
import requests

def handle_sso_callback(code: str, api_key: str, ttm_domain: str):
    url = f"{ttm_domain}/api/sso/token"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key
    }
    payload = {
        "code": code,
        "api_key": api_key
    }
    
    response = requests.post(url, json=payload, headers=headers)
    data = response.json()
    
    if data.get("success"):
        user_info = data["user"]
        # user_info = {"id": 15, "email": "...", "fullName": "...", "role": "..."}
        return user_info
    else:
        raise Exception(f"SSO Auth Error: {data.get('message')}")
```

---

### C. Java / Spring Boot
```java
@RestController
@RequestMapping("/auth")
public class SsoCallbackController {

    @Value("${ttm.api.key}")
    private String apiKey;

    @Value("${ttm.tool.domain}")
    private String ttmDomain;

    @GetMapping("/callback")
    public ResponseEntity<?> handleCallback(@RequestParam("code") String code, HttpSession session) {
        RestTemplate restTemplate = new RestTemplate();
        String tokenUrl = ttmDomain + "/api/sso/token";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-API-Key", apiKey);

        Map<String, String> body = new HashMap<>();
        body.put("code", code);
        body.put("api_key", apiKey);

        HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);
        ResponseEntity<Map> response = restTemplate.postForEntity(tokenUrl, entity, Map.class);

        Map<String, Object> resBody = response.getBody();
        if (resBody != null && Boolean.TRUE.equals(resBody.get("success"))) {
            Map<String, Object> user = (Map<String, Object>) resBody.get("user");
            session.setAttribute("LOGGED_USER", user);
            return ResponseEntity.status(HttpStatus.FOUND).header("Location", "/dashboard").build();
        }

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(resBody.get("message"));
    }
}
```

---

### D. Test bằng cURL
```bash
curl -X POST "https://ttm-tool-domain/api/sso/token" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ttm_ak_your_key_here" \
  -d '{
        "code": "ttm_ac_your_code_here",
        "api_key": "ttm_ak_your_key_here"
      }'
```

---

## 4. Danh sách Mã Lỗi (Error Response Reference)

Khi lệnh `POST /api/sso/token` thất bại (`400 Bad Request`), response sẽ trả về định dạng:

```json
{
  "success": false,
  "error": "MÃ_LỖI",
  "message": "Mô tả chi tiết nguyên nhân lỗi"
}
```

| Mã lỗi (`error`) | Nguyên nhân | Hướng xử lý |
| :--- | :--- | :--- |
| `INVALID_API_KEY` | API Key gửi lên không khớp hoặc không tìm thấy. | Kiểm tra lại cấu hình API Key trong màn hình Quản trị hệ thống. |
| `CODE_NOT_FOUND` | Mã `code` không tồn tại trong hệ thống. | Kiểm tra tham số `code` truyền vào. |
| `CODE_ALREADY_USED` | Mã `code` đã được trao đổi 1 lần trước đó. | Mã code chỉ dùng được 1 lần. Yêu cầu người dùng đăng nhập lại từ Bước 2. |
| `CODE_EXPIRED` | Mã `code` đã quá thời hạn 5 phút. | Mã code quá 5 phút sẽ bị hủy. Yêu cầu đăng nhập lại từ Bước 2. |
| `CLIENT_INACTIVE` | API Key đang bị vô hiệu hóa (Inactive). | Đăng nhập SuperAdmin để bật lại API Key. |
| `USER_INACTIVE` | Tài khoản người dùng đăng nhập bị khóa. | Liên hệ Admin mở lại tài khoản `ttm-tool`. |

---

## 5. Security Checklist cho AI Agent & Developer

Khi viết code cho Ứng dụng B, **AI Agent MUST (bắt buộc)** tuân thủ các quy tắc sau:
1. **Không lưu API Key ở code client / frontend:** Lưu `API Key` trong môi trường bảo mật backend (file `.env` hoặc Secret Manager).
2. **Luôn sử dụng HTTPS:** Mọi URL kết nối đến `ttm-tool` phải bắt đầu bằng `https://`.
3. **Luôn kiểm tra mã `state` (CSRF Protection):** Tạo chuỗi ngẫu nhiên khi redirect và xác minh khi nhận callback.
4. **Không lưu trữ mã `code` lâu:** Gọi API `POST /api/sso/token` ngay khi nhận được callback và hủy biến `code`.
