# TTM Dashboard 2 — Tài Liệu Đặc Tả Kiến Trúc & Quy Tắc Tính Phễu Dữ Liệu

> Ngày cập nhật: 2026-10-03  
> Module: `src/app/ttm-dashboard-2/page.tsx`  
> API Endpoint: `src/app/api/ttm-dashboard-2/route.ts`  
> Quyền truy cập: Role `Supervisor` trở lên (`SUPERADMIN`, `ADMIN`, `SUPERVISOR`)

---

## 1. Mục Đích & Tổng Quan Hệ Thống

**TTM Dashboard 2** là màn hình trực quan hóa luồng dữ liệu (Data Pipeline Funnel) từ dữ liệu thô nạp từ Jira/nguồn, qua các tầng lọc chuẩn hóa, kiểm tra sai lệch dữ liệu, cho đến phân loại trạng thái hoàn thành và đánh giá chỉ số **TTM-CNTT (Time to Market)**.

Giao diện được thiết kế gồm bố cục 2 cột tương tác trực quan:
1. **Top Header Banner & Toolbar Bộ Lọc:** Đồng bộ với TTM Dashboard (`dashboard-new`), gồm 3 chỉ số TTM Global (QLDA, QA, E2E), User Preview Switcher (`Lead` vs `PM/SM`) và thanh bộ lọc 1 dòng (`Domain`, `Dự án`, `PM/SM`, `Đơn vị yêu cầu`).
2. **Panel 1 (Cột bên trái) — Phễu Lọc Dữ Liệu Tổng Quan & Phân Nhánh Tiến Độ (4 Tầng):**
   - **Layer 1:** Tổng Epic Nguồn.
   - **Layer 2:** Lọc Cancelled.
   - **Layer 3:** Lọc Sai lệch dữ liệu.
   - **Layer 4:** Phân nhánh thành 2 nửa: **Epic Hoàn Thành (4a)** vs **Epic Chưa Hoàn Thành (4b)**. Tỷ lệ diện tích chia theo số liệu thực tế kẹp trong khoảng $[20\%, 80\%]$.
3. **Panel Bên Phải (Cột bên phải) — Phễu Chi Tiết Tiến Độ:**
   - Khi người dùng bấm **chuột trái vào nửa Layer 4a** -> Hiển thị **Panel 2: Phễu Epic Hoàn Thành** (Layer 4a -> Layer 5a: Đạt vs Fail TTM-CNTT).
   - Khi người dùng bấm **chuột trái vào nửa Layer 4b** -> Hiển thị **Panel 3: Phễu Epic Chưa Hoàn Thành** (Layer 4b -> Layer 5b: Còn lại vs Fail quá Target).
   - Tỷ lệ diện tích các nhóm phân tách trong cùng một tầng được vẽ tỉ lệ thuận theo số liệu thực tế (kẹp $[20\%, 80\%]$).
   - Text nhãn dài hoặc nhóm hẹp được trỏ bằng **Đường chỉ dẫn gập khúc (Callout pointer line)** ra ngoài hình phễu, giúp giao diện thông thoáng và không bị tràn chữ.

---

## 2. Quy Tắc Tính Toán & ID Định Vị Dữ Liệu (Layer & Group IDs)

Mỗi tầng (Layer) hoặc nhóm (Group) trên các biểu đồ phễu đều có mã định danh **ID** hiển thị ở góc trái phía trên của Popup mô tả khi **bấm chuột phải (Right-click)**:

```
                                [LAYER-01] Tổng Epic Nguồn
                                           │
                                           ▼ (- Cancelled)
                                [LAYER-02] Lọc Cancelled
                                           │
                                           ▼ (- Data Anomaly)
                                [LAYER-03] Lọc Sai Lệch Dữ Liệu
                                           │
               ┌───────────────────────────┴───────────────────────────┐
               ▼                                                       ▼
  [LAYER-04A] Epic Hoàn Thành                             [LAYER-04B] Epic Chưa Hoàn Thành
     (Đã có R4G Date)                                        (Chưa có R4G Date)
               │ (Click mở Panel 2)                                    │ (Click mở Panel 3)
               ▼                                                       ▼
  ┌────────────┴────────────┐                             ┌────────────┴────────────┐
  ▼                         ▼                             ▼                         ▼
[GROUP-05AA]              [GROUP-05AB]                  [GROUP-05BB]              [GROUP-05BA]
Đạt TTM-CNTT              Fail TTM-CNTT                 Còn lại (Trong hạn)       Fail TTM-CNTT
(Đúng hạn)                (Trễ hạn)                     (Đang triển khai)         (Quá Target)
                          └─► [Callout Line]                                      └─► [Callout Line]
```

### 2.1. Panel 1: Phễu Lọc Dữ Liệu Tổng Quan (4 Lớp)

| ID Layer | Tên Layer | Công Thức Tính | Quy Tắc Nghiệp Vụ & Điều Kiện Lọc |
|---|---|---|---|
| `LAYER-01` | **Tổng Epic Nguồn** | `Layer 1 = COUNT(Rows)` | Tổng số Epic nạp từ Jira trong phạm vi phân quyền của tài khoản và các bộ lọc đang chọn (`Domain`, `Project`, `PM/SM`, `Đơn vị yêu cầu`). |
| `LAYER-02` | **Lọc Cancelled** | `Layer 2 = Layer 1 - Cancelled` | Khấu trừ toàn bộ các Epic có trạng thái Đã hủy / Dừng triển khai: `isCancelledStatus(status)` (`Cancelled`, `Closed (Cancelled)`, `Rejected`, `Deferred`...). |
| `LAYER-03` | **Lọc Sai Lệch Dữ Liệu** | `Layer 3 = Layer 2 - Data Anomaly` | Khấu trừ các Epic vi phạm quy tắc toàn vẹn dữ liệu: `r.hasDataAnomaly === true` (thiếu mốc R4G, ngày kết thúc < ngày bắt đầu, sai lệch mốc Golive so với release status...). |
| `LAYER-04A` | **Epic Hoàn Thành (Nửa trái L4)** | `Layer 4A = COUNT(r.r4gDate != null)` | Lọc các Epic trong Layer 3 đã ghi nhận mốc ngày hoàn thành `R4G Date` thực tế. Click chuột trái để xem Panel 2 bên phải. |
| `LAYER-04B` | **Epic Chưa Hoàn Thành (Nửa phải L4)** | `Layer 4B = Layer 3 - Layer 4A` | Các Epic trong Layer 3 chưa ghi nhận mốc `R4G Date` thực tế. Click chuột trái để xem Panel 3 bên phải. |

---

### 2.2. Panel 2: Phễu Epic Hoàn Thành (Hiển thị bên phải khi chọn 4A)

| ID Layer / Nhóm | Tên Layer / Nhóm | Công Thức Tính | Quy Tắc Nghiệp Vụ & Điều Kiện Lọc |
|---|---|---|---|
| `LAYER-04A` | **Epic Hoàn Thành** | `Layer 4A = COUNT(r.r4gDate != null)` | Tổng số Epic hoàn thành đã ghi nhận mốc `R4G Date` thực tế. |
| `GROUP-05AA` | **Đạt TTM-CNTT** | `Nhóm 5AA = COUNT(isTtmIndexPass(r))` | Các Epic trong Layer 4A thỏa mãn: nằm trong phạm vi TTM-CNTT (`ttmCnttInScope`), có R4G Date đúng hạn (không quá Target), không có data anomaly, `alertLevel === 'NONE'`. |
| `GROUP-05AB` | **Fail TTM-CNTT (Trễ hạn)** | `Nhóm 5AB = Layer 4A - Nhóm 5AA` | Các Epic trong Layer 4A đã hoàn thành nhưng mốc `R4G Date` bị trễ hạn so với mốc `Target R4G Date` hoặc vi phạm SLA. Có đường Callout chỉ dẫn nhãn `"Trễ hạn"` ra ngoài. |

---

### 2.3. Panel 3: Phễu Epic Chưa Hoàn Thành (Hiển thị bên phải khi chọn 4B)

| ID Layer / Nhóm | Tên Layer / Nhóm | Công Thức Tính | Quy Tắc Nghiệp Vụ & Điều Kiện Lọc |
|---|---|---|---|
| `LAYER-04B` | **Epic Chưa Hoàn Thành** | `Layer 4B = Layer 3 - Layer 4A` | Các Epic trong Layer 3 chưa ghi nhận mốc `R4G Date` thực tế (đang ở giai đoạn Design, In Progress, Ready for Golive...). |
| `GROUP-05BB` | **Còn Lại (Đang trong hạn)** | `Nhóm 5BB = Layer 4B - Nhóm 5BA` | Các Epic chưa hoàn thành và vẫn đang trong ngân sách thời gian làm việc (chưa vượt Target R4G Date, còn cơ hội đạt đúng hạn). |
| `GROUP-05BA` | **Fail TTM-CNTT (Quá hạn Target)** | `Nhóm 5BA = COUNT(r.alertLevel === 'FAIL' \|\| ttmFailKind(r) === 'MISSING_R4G')` | Các Epic chưa hoàn thành nhưng số ngày làm việc thực tế đã vượt quá ngày `Target R4G Date` (đã chắc chắn Fail TTM-CNTT). Có đường Callout chỉ dẫn nhãn `"Quá Target"` ra ngoài. |

---

## 3. Tương Tác Người Dùng & Kỹ Thuật Đồ Họa SVG

1. **Chuột Phải (Right-Click / Context Menu):** Mở Modal chi tiết diễn giải công thức, số lượng, quy tắc nghiệp vụ và danh sách phân bổ kèm mã ID ở góc trái tiêu đề.
2. **Chuột Trái (Left-Click):**
   - Click vào nửa Layer 4A hoặc 4B trên Panel 1 để chuyển đổi hiển thị Panel 2 / Panel 3 ở cột bên phải.
   - Có thể chuyển tab trực tiếp bằng thanh switcher trên đầu Panel bên phải.
3. **Kỹ thuật khớp nắp 3D bằng `<clipPath>`:**
   - Toàn bộ nắp elip đỉnh của các tầng chia nhóm (Layer 4 của Panel 1, Layer 5A của Panel 2, Layer 5B của Panel 3) sử dụng kỹ thuật SVG `<clipPath>` cắt theo tọa độ chia $x_{\text{split}}$, đảm bảo độ khớp khít $100\%$ với thân nón cụt, không bị hở mép hay tai bè.
4. **Tỷ lệ diện tích động $[20\%, 80\%]$:**
   - Tọa độ chia $x_{\text{split}}$ ở đỉnh và đáy được tính toán theo tỷ lệ số liệu thực tế $p = \text{clamp}\left(\frac{N_1}{N_1 + N_2}, 0.2, 0.8\right)$ đảm bảo tính trực quan của biểu đồ tỷ lệ diện tích mà nhóm nhỏ hơn vẫn luôn đủ tối thiểu $20\%$ diện tích để quan sát.
5. **Đường kẻ chỉ dẫn (Callout Line):**
   - Vẽ bằng SVG `<path>` gập khúc từ sườn phải thân layer ra nhãn chữ rõ nét bên ngoài.
6. **Drilldown Link:** Trong mỗi popup đều có nút chuyển nhanh sang **Quản trị Epic (`/epic-alerts-15`)** với bộ lọc deep-link tương ứng để kiểm tra chi tiết danh sách từng Epic.

