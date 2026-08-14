# 13 — Quản lý Epic 15 và Quản lý Epic 30

## Phân tách màn hình

- `/epic-alerts`: **Quản lý Epic 30**, theo các cột Design, In Progress, Ready4Golive, Release.
- `/epic-alerts-15`: **Quản lý Epic 15**, theo các pha Design, Dev, Test, Pentest, R4Golive, Release.

Hai màn hình dùng chung quyền truy cập, dữ liệu Epic mới nhất, holiday, tiêu chí TTM-CNTT và lịch sử cảnh báo.

## Thứ tự trạng thái Epic

```text
To Do → IN PO → Design → DEV → TEST → PENTEST → R4GOLIVE → MVPDONE → Released
```

Alias tương thích dữ liệu Jira: `In Progress`/`In Dev` = DEV; `Pen Test` = PENTEST; `Ready For Golive`/`Ready4Golive` = R4GOLIVE. Pending và Cancelled không nằm trong chuỗi tuần tự.

## TTM-CNTT và rule pha Epic 15

Tổng số ngày TTM-CNTT lấy từ tiêu chí TTM-CNTT active theo loại Epic. Baseline tính theo ngày làm việc từ Start Date, bỏ cuối tuần và holiday active:

| Pha | Tỷ lệ tích lũy | Baseline |
|---|---:|---|
| Design | 20% | Start Date + round(total × 20%) |
| Dev | 50% | Start Date + round(total × 50%) |
| Test | 80% | Start Date + round(total × 80%) |
| Pentest | 90% | Start Date + round(total × 90%) |
| R4Golive | 100% | Start Date + total |

Phần ngày của mỗi pha là chênh lệch giữa hai mốc tích lũy liên tiếp, nên tổng luôn bằng đúng TTM-CNTT. Khi chưa cấu hình rule status riêng, DEV/TEST/PENTEST dùng offset cảnh báo sớm/muộn của `In Progress`.
