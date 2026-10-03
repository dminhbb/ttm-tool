# TTM Dashboard 2 — Tài Liệu Đặc Tả Kiến Trúc & Quy Tắc Tính Phễu Dữ Liệu

> Ngày cập nhật: 2026-10-03
> Module: `src/app/ttm-dashboard-2/page.tsx` (vẽ phễu: `src/components/ttm-dashboard-2/FunnelLayers.tsx`)
> API Endpoint: `src/app/api/ttm-dashboard-2/route.ts`
> Quy tắc phân nhóm: `ttmFunnelBucket` trong `src/lib/epic-row-verdicts.ts` (bản SQL song song trong `src/lib/epic-alert-row-cache-query-service.ts`)
> Quyền truy cập: Role `Supervisor` trở lên (`SUPERADMIN`, `ADMIN`, `SUPERVISOR`)

---

## 1. Mục Đích & Tổng Quan

**TTM Dashboard 2** trực quan hóa luồng dữ liệu Epic dưới dạng phễu: từ tổng Epic trong phạm vi quyền, qua các tầng lọc (Cancelled, Sai lệch dữ liệu), đến phân loại hoàn thành và kết quả chấm **TTM-CNTT (QLDA)**.

Bố cục:
1. **Header & thanh bộ lọc 1 dòng** — giống TTM Dashboard (`dashboard-new`): 3 chỉ số TTM toàn hệ thống (QLDA, QA, E2E), nút Lead / PM-SM (xem dưới quyền user), bộ lọc `Domain`, `Dự án`, `PM/SM`, `Đơn vị yêu cầu`.
2. **Panel 1 — Phễu tổng quan (4 tầng)**: Layer 1 → Layer 2 → Layer 3 → Layer 4 (chia nhóm 4A / 4B / 4C).
3. **Panel 2 / Panel 3 (accordion bên phải)** — mở khi bấm chuột trái vào nửa 4A (Panel 2: Epic hoàn thành) hoặc 4B (Panel 3: Epic chưa hoàn thành).

## 2. Quy Tắc Phân Nhóm (mỗi Epic thuộc đúng 1 nhóm lá)

```
[LAYER-01] Tổng Epic (kể cả Cancelled)
   │  − Cancelled                      (trạng thái chứa "cancel", không phân biệt hoa/thường)
[LAYER-02] Lọc Cancelled
   │  − Sai lệch dữ liệu               (hasDataAnomaly — không chấm Đạt/Fail)
[LAYER-03] Lọc Sai lệch dữ liệu  =  4A + 4B + 4C
   ├── [LAYER-04A] Hoàn thành: trong phạm vi TTM-CNTT, có R4G Date  (= mẫu số TTM-CNTT QLDA)
   │      ├── [GROUP-05AA] Đạt TTM-CNTT
   │      ├── [GROUP-05AB] Fail TTM-CNTT — Trễ R4G     (= "Trễ R4G" ở TTM Dashboard)
   │      └── [GROUP-05AC] Chưa chấm — R4G Date tương lai / không tính được Target
   ├── [LAYER-04B] Chưa hoàn thành: trong phạm vi TTM-CNTT, chưa có R4G Date
   │      ├── [GROUP-05BA] Fail TTM-CNTT — Quá Target  (= "Thiếu R4G" ở TTM Dashboard)
   │      └── [GROUP-05BB] Đang trong hạn
   └── [LAYER-04C] Ngoài phạm vi TTM-CNTT  (chỉ hiển thị khi > 0)
```

| ID | Tên | Điều kiện (theo thứ tự, dừng ở điều kiện đầu tiên khớp) | Bộ lọc "Nhận xét" khi mở danh sách |
|---|---|---|---|
| `LAYER-01` | Tổng Epic | Mọi Epic trong phạm vi quyền + bộ lọc | `status` = mọi trạng thái đang có (kể cả Cancelled) |
| `LAYER-02` | Lọc Cancelled | Layer 1 − Epic có trạng thái chứa "cancel" | `status` = các trạng thái Cancelled đang có |
| `LAYER-03` | Lọc Sai lệch dữ liệu | Layer 2 − Epic `hasDataAnomaly` | `dataIssue=1` |
| `LAYER-04A` | Hoàn thành | trong phạm vi TTM-CNTT, có R4G Date | `TTM_ELIGIBLE_IN_SCOPE` |
| `GROUP-05AA` | Đạt | 4A và được chấm Đạt (Scoring: cờ chỉ số `TTM_PASS`; Legacy: `alertLevel = NONE`) | `TTM_PASS_IN_SCOPE` |
| `GROUP-05AB` | Fail — Trễ R4G | 4A, không Đạt, `alertLevel = FAIL` | `TTM_LATE_IN_SCOPE` |
| `GROUP-05AC` | Chưa chấm | 4A, không Đạt, không Fail | `TTM_NOT_SCORED_IN_SCOPE` |
| `LAYER-04B` | Chưa hoàn thành | trong phạm vi TTM-CNTT, chưa có R4G Date | `MISSING_R4G_IN_SCOPE` |
| `GROUP-05BA` | Fail — Quá Target | 4B, `alertLevel = FAIL` | `OVERDUE_MISSING_R4G_IN_SCOPE` |
| `GROUP-05BB` | Đang trong hạn | 4B, không Fail | `WITHIN_TARGET_MISSING_R4G` |
| `LAYER-04C` | Ngoài phạm vi | Layer 3, ngoài "Phạm vi dữ liệu cho TTM" | `OUT_OF_SCOPE_NO_ANOMALY` |

Tỷ lệ Đạt ở Panel 2 = 5AA / 4A, cùng công thức với chỉ số TTM-CNTT (QLDA) (pass / eligible).

## 3. Danh Sách Epic (popup Quản trị Epic)

Nút "Xem … Epic" trong popup diễn giải mở **Quản trị Epic** nhúng trong trang (cùng component `EpicAlertsIframeModal`, cùng kích thước và nền mờ với TTM Dashboard; có nút "Mở tab mới"). Danh sách phụ thuộc đồng thời:
1. **Quyền của user** — phạm vi dự án/component của người xem; khi đang **xem dưới quyền** một user, deep-link mang `viewAsUserId` và API `/api/epic-alerts-15` áp đúng phạm vi user đó (cùng quy tắc `src/lib/view-as-user-service.ts` với TTM Dashboard).
2. **Phạm vi dữ liệu cho TTM** — cờ `ttmCnttInScope` đã tính sẵn trong cache, dùng chung cho phễu và danh sách.
3. **Bộ lọc của TTM Dashboard 2** — Domain (quy ra danh sách dự án), Dự án, PM/SM, Đơn vị yêu cầu.
4. **Điều kiện của tầng/nhóm** — cột cuối bảng ở §2.

Vì phễu và danh sách dùng cùng một định nghĩa (`ttmFunnelBucket` ↔ SQL song song), con số trên phễu luôn bằng số dòng của danh sách.

## 4. Tương Tác & Đồ Họa

1. **Chuột phải** vào một tầng/nhóm (hoặc nhãn callout của nhóm): mở popup diễn giải (mã ID, số lượng, quy tắc, công thức, nút xem danh sách).
2. **Chuột trái** (hoặc Enter/Space khi focus) vào nửa 4A/4B của Layer 4: mở/đóng Panel 2/3; thanh chuyển nhanh và nút đóng ở đầu panel phải.
3. **Accordion 0.7s**: chuyển `grid-template-columns` (màn hình rộng: Panel 1 100% ↔ 50/50) và `grid-template-rows` (màn hình hẹp, xếp dọc); có hiệu ứng cả khi mở và khi đóng. Các class transition dùng `!important` vì `globals.css` ép mọi transition về 0.01ms khi hệ điều hành bật giảm chuyển động (Windows tắt "Animation effects").
4. **Chia nhóm theo tỷ lệ**: độ rộng mỗi nhóm tỷ lệ với số lượng, nhóm khác 0 tối thiểu 14%; nắp elip cắt theo từng nhóm bằng `<clipPath>`.
5. **Callout tự động**: nhóm quá hẹp để chứa chữ sẽ đưa số + nhãn ra ngoài bằng đường chỉ dẫn gập khúc (bên phải hoặc trái tùy vị trí nhóm).
