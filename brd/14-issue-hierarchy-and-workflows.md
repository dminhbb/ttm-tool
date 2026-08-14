# 14 — Phân cấp Issue Type và workflow Jira

## Source of truth

Tài liệu này là nguồn chuẩn cho việc phân loại Issue Type của dữ liệu Jira, kiểm tra dữ liệu import, hiển thị cây dữ liệu và API đánh giá tuân thủ.

## Phân cấp dữ liệu

| Cấp | Issue Type Jira | Tên gọi trong ứng dụng |
|---:|---|---|
| 1 | `Epic`, `CTNB` | Epic |
| 2 | `Story`, `Task`, `Enabler Story` | Story |
| 3 | Mọi Issue Type còn lại, ví dụ `Sub-task`, `Bug`, `Technical Task` | Subtask |

Tên Issue Type gốc từ Jira vẫn được lưu và hiển thị. Việc gọi chung “Subtask” chỉ phục vụ workflow và phân cấp nghiệp vụ.

## Workflow Story (cấp 2)

```text
To Do → Analyzing → Ready For Refine → Waiting For Planning → Ready For Dev
→ In Dev → Dev Done → Ready For Test → In SIT → SIT Done → In UAT → UAT Done
→ Ready For Golive → Released
```

## Workflow Subtask (cấp 3)

Mọi Issue Type cấp 3 sử dụng cùng một workflow:

```text
To Do → In Progress → Done
```

## Status đặc biệt

`Pending` và `Cancelled` không nằm trong thứ tự của workflow Epic, Story hoặc Subtask. Chúng có thể xuất hiện tại mọi thời điểm và không được dùng để so sánh trước/sau giữa các giai đoạn.

## Quy tắc triển khai

- Import chỉ cảnh báo khi status không thuộc workflow của cấp tương ứng; không loại bỏ row chỉ vì cảnh báo này.
- Story thiếu Epic Link được cảnh báo. Subtask thiếu thông tin cha/Epic được cảnh báo để phục vụ rà soát dữ liệu.
- API `POST /api/epic-compliance` nhận literal Issue Type Jira thay vì chỉ ba nhãn cố định và trả về `hierarchyLevel` cùng metadata `workflow`.
- Trang Duyệt dữ liệu hiển thị Epic/CTNB ở tầng gốc, Story/Task/Enabler Story là tầng hai, và toàn bộ loại còn lại ở tầng Subtask.
