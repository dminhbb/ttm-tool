# TTM Dashboard 2 — Tài Liệu Đặc Tả Kiến Trúc & Quy Tắc Tính Phễu Dữ Liệu

> Ngày cập nhật: 2026-10-04
> Module: `src/app/ttm-dashboard-2/page.tsx` (vẽ phễu: `src/components/ttm-dashboard-2/FunnelLayers.tsx`)
> API Endpoint: `src/app/api/ttm-dashboard-2/route.ts`
> Quy tắc phân nhóm: `ttmFunnelBucket` trong `src/lib/epic-row-verdicts.ts` (bản SQL song song trong `src/lib/epic-alert-row-cache-query-service.ts`)
> Tên tiêu chí & tỷ lệ: `TTM_FUNNEL_CRITERIA`, `ttmFunnelLayers`, `ttmFunnelCnttIndex` trong `src/lib/ttm-funnel-summary.ts`
> Quyền truy cập: Role `Supervisor` trở lên (`SUPERADMIN`, `ADMIN`, `SUPERVISOR`)

---

## 1. Mục Đích & Tổng Quan

**TTM Dashboard 2** trực quan hóa luồng dữ liệu Epic dưới dạng phễu: từ tổng Epic trong phạm vi dữ liệu để tính toán, qua các tầng lọc (Cancelled, Sai lệch dữ liệu), đến phân loại hoàn thành và kết quả chấm **TTM-CNTT (QLDA)**.

Bố cục (từ trên xuống):
1. **Header & thanh bộ lọc 1 dòng** — giống TTM Dashboard (`dashboard-new`): 3 chỉ số TTM toàn công ty (QLDA, QA, E2E), nút Lead / PM-SM (xem dưới quyền user), bộ lọc `Domain`, `Dự án`, `PM/SM`, `Đơn vị yêu cầu`.
2. **Widget row** — hàng widget của TTM Dashboard, tính lại theo tiêu chí của phễu (§7.1).
3. **Panel 1 — Phễu tổng quan**: L01 → L02 → L03 → tầng cuối chia 2 nửa L04a | L04b. Dòng dưới phễu hiện L03, **Tỷ lệ % Pass / % Fail TTM-CNTT (QLDA)** của đúng tập Epic đang xem, và số Epic ngoài "Phạm vi dữ liệu cho TTM" (chỉ khi > 0).
4. **Panel 2 / Panel 3 (accordion bên phải)** — mở khi bấm chuột trái vào L04a (Panel 2: L05aa, L05ab, L05ac) hoặc L04b (Panel 3: L05ba, L05bb).
5. **Ma trận Phân bổ Tiến độ Epic Đa chiều** (§7.2) và bên dưới là các **section Pie chart** (§7.3).

Nhãn trên phễu chỉ ghi tên (ví dụ "Epic hoàn thành", "Đạt 324 · TTM-CNTT"), không ghi mã tiêu chí; mã L01…L05bb hiện trong popup diễn giải (chuột phải). Mọi chữ trong phễu — kể cả ghi chú kéo ra ngoài của nhóm hẹp — dùng font của trang (`fontFamily="inherit"`), không dùng font ngoài chưa nạp.

## 2. Tên Tiêu Chí & Quy Tắc Phân Nhóm (quy ước 2026-10-04)

**Phạm vi dữ liệu để tính toán** — mọi tiêu chí chỉ đếm Epic:
- nằm trong **"Phạm vi dữ liệu cho TTM"** (khoảng ngày "R4G for TTM (CNTT)" ở Cấu hình cảnh báo, cờ `ttmCnttInScope`);
- thuộc phạm vi quyền của người xem (hoặc của user đang được xem dưới quyền);
- khớp các bộ lọc Domain / Dự án / PM-SM / Đơn vị yêu cầu đang chọn.

Epic ngoài "Phạm vi dữ liệu cho TTM" **không nằm trong L01** (trước 2026-10-04 chúng được tính vào Layer 1–3 và hiện thành nhóm "4C"); màn hình chỉ hiện số lượng riêng để đối chiếu. Mỗi Epic thuộc đúng 1 nhóm lá, nên không Epic nào bị đếm hai lần.

```
(Ngoài "Phạm vi dữ liệu cho TTM" — không thuộc phễu)
[L01]  Tổng epic (kể cả Cancelled)
   │  − Cancelled                      (trạng thái chứa "cancel", không phân biệt hoa/thường)
[L02]  Epic loại bỏ Cancelled
   │  − Sai lệch dữ liệu               (hasDataAnomaly — không chấm Đạt/Fail)
[L03]  Epic chuẩn hoá dữ liệu  =  L04a + L04b
   ├── [L04a] Epic hoàn thành: có R4G Date
   │      ├── [L05aa] Epic đạt TTM-CNTT
   │      ├── [L05ab] Epic không đạt TTM-CNTT (nhóm 1) — R4G Date muộn hơn Target  (= "Trễ R4G" ở TTM Dashboard)
   │      └── [L05ac] Epic chưa kết luận — R4G Date tương lai / không tính được Target
   └── [L04b] Epic chưa hoàn thành: chưa có R4G Date
          ├── [L05ba] Epic không đạt TTM-CNTT (nhóm 2) — đã quá Target  (= "Thiếu R4G" ở TTM Dashboard)
          └── [L05bb] Epic trong hạn — chưa quá Target
```

| Mã | Tên tiêu chí | Cách tính | Nhóm lá (`ttmFunnelBucket`) | Bộ lọc khi mở danh sách |
|---|---|---|---|---|
| `L01` | Tổng epic | Mọi Epic trong phạm vi dữ liệu để tính toán (kể cả Cancelled) | mọi nhóm trừ `OUT_OF_SCOPE` | `alert=IN_SCOPE_CNTT` + `status` = mọi trạng thái đang có |
| `L02` | Epic loại bỏ Cancelled | L01 − các Epic có status Cancelled | − `CANCELLED` | `alert=IN_SCOPE_CNTT` + `status` = các trạng thái Cancelled (danh sách Epic bị loại) |
| `L03` | Epic chuẩn hoá dữ liệu | L02 − các Epic bị đánh dấu "Sai lệch dữ liệu" | − `DATA_ANOMALY` | `alert=DATA_ANOMALY_IN_SCOPE` (danh sách Epic bị loại) |
| `L04a` | Epic hoàn thành | Các Epic có R4G Date trong L03 | `R4G_PASS` + `R4G_LATE` + `R4G_NOT_SCORED` | `TTM_ELIGIBLE_IN_SCOPE` |
| `L04b` | Epic chưa hoàn thành | Các Epic không có R4G Date trong L03 | `NO_R4G_OVERDUE` + `NO_R4G_WITHIN_TARGET` | `MISSING_R4G_IN_SCOPE` |
| `L05aa` | Epic đạt TTM-CNTT | Các Epic Đạt TTM-CNTT trong L04a (Scoring: cờ chỉ số `TTM_PASS`; Legacy: `alertLevel = NONE`) | `R4G_PASS` | `TTM_PASS_IN_SCOPE` |
| `L05ab` | Epic không đạt TTM-CNTT (nhóm 1) | Các Epic không Đạt TTM-CNTT trong L04a: `alertLevel = FAIL` (R4G Date > Target) | `R4G_LATE` | `TTM_LATE_IN_SCOPE` |
| `L05ac` | Epic chưa kết luận | Các Epic trong L04a có R4G Date còn ở tương lai, hoặc không tính được Target R4G TTM-CNTT | `R4G_NOT_SCORED` | `TTM_NOT_SCORED_IN_SCOPE` |
| `L05ba` | Epic không đạt TTM-CNTT (nhóm 2) | Các Epic trong L04b đã quá Target R4G → Fail TTM-CNTT (QLDA) | `NO_R4G_OVERDUE` | `OVERDUE_MISSING_R4G_IN_SCOPE` |
| `L05bb` | Epic trong hạn | Các Epic trong L04b chưa quá Target R4G — vẫn còn cơ hội Đạt TTM-CNTT | `NO_R4G_WITHIN_TARGET` | `WITHIN_TARGET_MISSING_R4G` |
| — | Ngoài phạm vi dữ liệu cho TTM | Epic có `ttmCnttInScope = false` (mọi status), không tính vào L01 | `OUT_OF_SCOPE` | `alert=OUT_OF_SCOPE_CNTT` + `status` = mọi trạng thái đang có |

Thứ tự xét của `ttmFunnelBucket`: ngoài phạm vi → Cancelled → Sai lệch dữ liệu → có/không có R4G Date → Đạt / Fail / còn lại.

## 3. Tỷ Lệ % Pass / % Fail TTM-CNTT

```
Tỷ lệ % Pass TTM-CNTT = L05aa / (L05aa + L05ab + L05ba) × 100
Tỷ lệ % Fail TTM-CNTT = (L05ab + L05ba) / (L05aa + L05ab + L05ba) × 100
```

- Mẫu số chỉ gồm Epic **đã có kết luận**. L05ac, L05bb, Epic Cancelled, Epic Sai lệch dữ liệu và Epic ngoài phạm vi không tham gia.
- Mẫu số = 0 (chưa Epic nào được kết luận): phễu hiện "—"; các widget chỉ số hiện 100% Pass / 0% Fail.
- Hàm tính duy nhất: `summarizeTtmCnttFromCounts` (`src/lib/ttm-cntt-qa.ts`). Phễu gọi qua `ttmFunnelCnttIndex`; các chỉ số TTM-CNTT (QLDA) khác gọi qua `summarizeTtmCntt` / `queryTtmCnttIndexes` — nên tỷ lệ ở phễu luôn bằng chỉ số TTM-CNTT (QLDA) của cùng tập Epic.
- **Áp dụng chung** (không riêng màn hình này):
  - **TTM-CNTT (QLDA)** toàn công ty (`ttm_index_global_cache`) và theo phạm vi sau khi lọc + theo phân quyền người xem (TTM Dashboard, Quản trị Epic, MCP).
  - **TTM-CNTT (QA)** = cùng Tỷ lệ % Pass, nhưng chỉ lấy Epic có status `MVP Done` hoặc `Released` (trong khoảng "R4G for TTM (QA)") — cả mức toàn công ty lẫn theo phạm vi lọc + phân quyền (`summarizeQaIndex`).
  - TTM-E2E: từ 2026-10-05 dùng cùng công thức — Đạt TTM-E2E / (Đạt TTM-E2E + Fail TTM-E2E) (`summarizeE2e`).
- Trước 2026-10-04: tỷ lệ = L05aa / L04a (mẫu số gồm cả L05ac, không gồm L05ba).

## 4. Danh Sách Epic (popup Quản trị Epic)

Nút "Xem … Epic" trong popup diễn giải mở **Quản trị Epic** nhúng trong trang (cùng component `EpicAlertsIframeModal`, cùng kích thước và nền mờ với TTM Dashboard; có nút "Mở tab mới"). Danh sách phụ thuộc đồng thời:
1. **Quyền của user** — phạm vi dự án/component của người xem; khi đang **xem dưới quyền** một user, deep-link mang `viewAsUserId` và API `/api/epic-alerts-15` áp đúng phạm vi user đó (cùng quy tắc `src/lib/view-as-user-service.ts` với TTM Dashboard).
2. **Phạm vi dữ liệu cho TTM** — cờ `ttmCnttInScope` đã tính sẵn trong cache, dùng chung cho phễu và danh sách.
3. **Bộ lọc của TTM Dashboard 2** — Domain (quy ra danh sách dự án), Dự án, PM/SM, Đơn vị yêu cầu.
4. **Điều kiện của tiêu chí** — cột cuối bảng ở §2.

Vì phễu và danh sách dùng cùng một định nghĩa (`ttmFunnelBucket` ↔ SQL song song), con số trên phễu luôn bằng số dòng của danh sách.

## 5. Tương Tác & Đồ Họa

1. **Chuột phải** vào một tiêu chí (hoặc nhãn callout của nhóm): mở popup diễn giải (mã tiêu chí, số lượng, quy tắc, công thức, nút xem danh sách). Popup của L05aa / L05ab / L05ba hiện luôn công thức Tỷ lệ % Pass / % Fail với số liệu hiện tại.
2. **Chuột trái** (hoặc Enter/Space khi focus) vào nửa L04a / L04b: mở/đóng Panel 2/3; thanh chuyển nhanh và nút đóng ở đầu panel phải.
3. **Accordion 0.7s**: chuyển `grid-template-columns` (màn hình rộng: Panel 1 100% ↔ 50/50) và `grid-template-rows` (màn hình hẹp, xếp dọc); có hiệu ứng cả khi mở và khi đóng. Các class transition dùng `!important` vì `globals.css` ép mọi transition về 0.01ms khi hệ điều hành bật giảm chuyển động (Windows tắt "Animation effects").
4. **Chia nhóm theo tỷ lệ**: độ rộng mỗi nhóm tỷ lệ với số lượng, nhóm khác 0 tối thiểu 14%; nắp elip cắt theo từng nhóm bằng `<clipPath>`.
5. **Callout tự động**: nhóm quá hẹp để chứa chữ sẽ đưa số + nhãn ra ngoài bằng đường chỉ dẫn gập khúc (bên phải hoặc trái tùy vị trí nhóm).

## 6. Cache Số Liệu (2026-10-04)

- Bảng `ttm_dashboard_2_cache` lưu số liệu phễu **chưa lọc** + danh sách lựa chọn bộ lọc theo phạm vi dữ liệu: `ALL` (dùng chung SUPERADMIN + SUPERVISOR), `ADMIN:<id>` (dự án thuộc domain được gán + dự án Admin làm PM/SM), `USER:<id>` (dự án User làm PM/SM, có thu hẹp Component). Phạm vi luôn lấy từ `resolveAccessScope`, giống Quản trị Epic.
- Mở màn hình: API `/api/ttm-dashboard-2` chỉ đọc 1 dòng cache. Khi người dùng chọn bất kỳ bộ lọc nào, trang tải dữ liệu Epic của phạm vi một lần (`/api/ttm-dashboard-2/rows`) rồi tính lại bằng cùng hàm `summarizeTtmFunnel` (`src/lib/ttm-funnel-summary.ts`) đã dùng để dựng cache.
- Một dòng cache chỉ được dùng khi khớp: thời điểm dựng `epic_alert_row_cache`, engine hiển thị, dấu vân tay phạm vi (đổi phân quyền user/domain/dự án ⇒ dựng lại) và **phiên bản payload** (`PAYLOAD_VERSION` trong `ttm-dashboard-2-cache-service.ts`; 2 = phễu chỉ tính trong "Phạm vi dữ liệu cho TTM", 3 = thêm `insights` cho widget row / ma trận / pie chart). Thiếu/cũ thì tính ngay và lưu lại. `refreshDerivedCaches` làm ấm lại toàn bộ sau mỗi lần dựng cache dữ liệu.

## 7. Widget Row, Ma Trận & Pie Chart (2026-10-04)

Ba khối này lấy từ TTM Dashboard và tính lại theo tiêu chí của phễu. Số liệu nằm trong `TtmFunnelSummary.insights` (`summarizeTtmFunnel`, `src/lib/ttm-funnel-summary.ts`) — cùng một lần duyệt Epic với phễu, nên luôn khớp phễu; vẽ bởi `src/components/ttm-dashboard-2/DashboardInsights.tsx`. Mọi con số bấm được đều mở Quản trị Epic với quyền người xem + bộ lọc đang chọn.

### 7.1. Widget row

| Widget | Giá trị | Dòng phụ |
|---|---|---|
| Tổng số Epic | **L02** | `Trừ Cancelled= ` + số Epic status Cancelled (L01 − L02) |
| Fail TTM-CNTT (QLDA) | **L05ab + L05ba** | `/Số Epic= ` + (L05aa + L05ab + L05ba) |
| TTM-CNTT (QLDA) | Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba) | tử số / mẫu số |
| TTM-CNTT (QA) | Cùng công thức, chỉ Epic MVP Done / Released trong "R4G for TTM (QA)" | tử số / mẫu số |
| Hoàn thành TTM-E2E | Epic đạt TTM-E2E / (Epic đạt + Epic Fail TTM-E2E) — cùng công thức TTM-CNTT từ 2026-10-05; không áp "Phạm vi dữ liệu cho TTM" | tử số / mẫu số |
| Chậm tiến độ, Sai lệch Dữ liệu, Chờ golive (thiếu R4G / trong hạn / quá hạn), Giải trình Golive | Như TTM Dashboard: đếm trên mọi Epic không Cancelled của tập đang xem | — |

"Chờ golive: trong hạn / quá hạn" được tách theo ngày hiện tại lúc xem (`splitWaitingGolive`), nên số trong cache không bị cũ qua ngày.

### 7.2. Ma trận Phân bổ Tiến độ Epic Đa chiều

Lead view: 4 tab (Domain, Phân loại Epic, PM/SM, Dự án); PM/SM view: 2 tab (Phân loại Epic, Dự án). Mỗi dòng là một giá trị của chiều đang chọn; Epic thiếu loại tính là CT-Lv12 như ở engine chấm.

| Cột | Giá trị |
|---|---|
| Tổng số Epic | L02 của dòng |
| Pass TTM | L05aa |
| TTM-CNTT (QLDA) | Pass TTM / Epic đánh giá |
| Epic đánh giá | L05aa + L05ab + L05ba |
| Fail TTM | L05ab + L05ba (dòng phụ: Trễ R4G = L05ab · Thiếu R4G = L05ba) |
| TTM-CNTT (QA) | Tỷ lệ QA của dòng (tử số / mẫu số) |
| Sai lệch dữ liệu | L02 − L03 của dòng — Epic Sai lệch dữ liệu, chưa được chấm TTM-CNTT. Từ 2026-10-05 đếm riêng (`TtmBreakdownItem.anomaly`), không còn nằm trong "Đúng tiến độ" |
| Đúng tiến độ / Chậm tiến độ | Epic chưa có R4G Date và không Sai lệch dữ liệu (L04b): Chậm = đang Fail hoặc Cảnh báo muộn, còn lại là Đúng |

Tổng theo cột của một chiều luôn bằng tiêu chí tương ứng của phễu (Σ Tổng số Epic = L02, Σ Pass TTM = L05aa, Σ Fail TTM = L05ab + L05ba).

### 7.3. Section Pie chart

Lead view: Theo Đơn vị yêu cầu, Theo Domain nghiệp vụ (khi có > 1 domain), Theo Phân loại Epic (mở sẵn), Theo PM/SM, Theo Dự án; PM/SM view: chỉ Theo Phân loại Epic. Mỗi section có 3 biểu đồ:

| Biểu đồ | Số liệu theo từng giá trị của chiều |
|---|---|
| % Tổng số Epic | L02 |
| % Pass TTM | L05aa |
| % Fail TTM | L05ab + L05ba |

(Ở TTM Dashboard, "% Epic Fail TTM (pm)" còn cộng cả Epic Fail TTM-E2E; ở đây chỉ gồm Fail TTM-CNTT.)
