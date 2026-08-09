# Prompt cho AI Agent: Redesign bảng "Quản trị nguồn dữ liệu" thành Tree Table 3 cấp

## Bối cảnh
Trong dự án hiện tại có màn hình "Quản trị nguồn dữ liệu" (trang duyệt dữ liệu import Jira → TTM Monitor), hiển thị dữ liệu 3 cấp: **Epic → Story → Subtask**.

Hiện tại bảng đang hiển thị **phẳng** (flat table), mỗi Epic là 1 dòng, muốn xem Story/Subtask phải bấm nút "Mở" để điều hướng sang view khác. Trải nghiệm rời rạc, mất ngữ cảnh.

## Mục tiêu
Redesign lại component bảng này thành **tree table (bảng cây) thu gọn/mở rộng được, hiển thị cả 3 cấp ngay trong cùng một bảng**, theo phong cách tham khảo đính kèm (bảng "Categories" có cấu trúc Category → Subcategory → Item).

## Yêu cầu chức năng

1. **3 cấp dữ liệu hiển thị lồng nhau trong cùng 1 bảng**:
   - Cấp 1: Epic
   - Cấp 2: Story
   - Cấp 3: Subtask
2. Mỗi dòng có **icon chevron** (▼ khi đang mở, ▲/► khi đóng) ở đầu dòng để expand/collapse, chỉ hiển thị nếu dòng đó có con.
3. Dòng không có con (ví dụ Subtask, hoặc Story không có Subtask) thì **không có chevron**, chỉ có đường kẻ nối (connector line) thể hiện nó thuộc cấp cha nào.
4. **Thụt lề (indentation)** tăng dần theo cấp: cấp 1 sát lề trái nhất, cấp 2 thụt vào ~24-32px, cấp 3 thụt thêm ~24-32px nữa.
5. **Đường kẻ phân cấp**: dùng đường dọc (vertical line) nối từ dòng cha xuống các dòng con, và đường ngang ngắn (horizontal connector) nối vào tên của dòng con — giống cấu trúc cây thư mục (giống ảnh mẫu "Categories").
6. Checkbox chọn dòng ở đầu mỗi dòng cấp 1 (tuỳ chọn: có thể thêm cho tất cả các cấp nếu cần chọn nhiều để export/duyệt hàng loạt).
7. **Mặc định**: bảng chỉ hiển thị danh sách cấp 1 (Epic). Cấp 2 (Story) và cấp 3 (Subtask) **không hiển thị** cho tới khi người dùng chủ động mở.
8. Khi bấm chevron trên 1 dòng Epic (cấp 1) → **expand**: hiện danh sách Story liên kết tới Epic đó, chèn ngay bên dưới dòng Epic (thụt lề cấp 2). Khi bấm chevron trên 1 dòng Story (cấp 2) → hiện danh sách Subtask liên kết tới Story đó, chèn ngay bên dưới (thụt lề cấp 3).
9. **Hành vi accordion (chỉ mở 1 dòng tại 1 thời điểm trong cùng cấp)**:
   - Ở **cấp 1**: tại một thời điểm chỉ được mở **tối đa 1 Epic**. Khi người dùng bấm expand một Epic khác trong lúc đang có 1 Epic mở → Epic đang mở đó (và toàn bộ cấp 2, cấp 3 bên trong nó) sẽ **tự động đóng lại**, trước khi Epic mới được mở ra.
   - Ở **cấp 2**: tương tự, trong phạm vi 1 Epic đang mở, tại một thời điểm chỉ được mở **tối đa 1 Story**. Khi mở 1 Story khác → Story đang mở (và cấp 3 bên trong nó) sẽ tự động đóng lại.
   - Nói cách khác: đây là accordion 2 tầng độc lập theo từng cấp cha — không phải "mở nhiều cùng lúc" như checkbox tree thông thường, mà giống kiểu accordion/collapse-panel (chỉ 1 panel mở tại 1 thời điểm) áp dụng lồng nhau cho cả 2 cấp.
   - Trạng thái expanded nên lưu dạng: `expandedEpicId: string | null` và `expandedStoryId: string | null` (không cần `Set` nhiều id như đề xuất trước, vì tại một thời điểm chỉ có tối đa 1 Epic và 1 Story đang mở).
9. Giữ nguyên các cột dữ liệu hiện có: PROJECT, ID, ISSUE TYPE, KEY, STATUS, START DATE, R4G DATE, DUE DATE, SUMMARY — nhưng cột đầu tiên (nơi có tên) sẽ chứa chevron + connector line + tên/summary.
10. Style Status vẫn giữ dạng badge màu (In Progress, To Do, Design...) như hiện tại.
11. Bảng cần responsive / có scroll ngang khi nhiều cột (giữ hành vi scroll ngang hiện có).

## Yêu cầu về UI/CSS (theo ảnh mẫu)

- Icon chevron: hình tròn viền mỏng, mũi tên bên trong, màu xanh dương khi active/mở, màu xám khi đóng.
- Connector line: màu xám nhạt (#E0E0E0 hoặc tương đương), độ dày 1px.
- Font, cỡ chữ, khoảng cách dòng (row height ~48-56px) đồng nhất với phần còn lại của bảng hiện có trong hệ thống — **không tự ý đổi theme/màu sắc tổng thể**, chỉ áp dụng cho cấu trúc tree/indent.
- Hover row: đổi nền nhẹ (subtle background) để dễ theo dõi dòng đang trỏ tới.
- Đảm bảo accessibility: chevron button có `aria-expanded`, `aria-label` ("Mở rộng Epic WM-30864"...).

## Gợi ý kỹ thuật triển khai

- Tạo 1 component `TreeTableRow` nhận `level` (1/2/3), `data`, `isExpanded`, `onToggle`.
- Quản lý state mở/đóng bằng **2 biến đơn** (không phải `Set` nhiều phần tử, vì mỗi cấp chỉ mở tối đa 1 dòng tại 1 thời điểm):
  ```ts
  const [expandedEpicId, setExpandedEpicId] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);

  function handleToggleEpic(epicId: string) {
    if (expandedEpicId === epicId) {
      setExpandedEpicId(null); // đóng lại nếu bấm lại chính nó
    } else {
      setExpandedEpicId(epicId); // mở epic mới, tự động thay thế epic cũ
    }
    setExpandedStoryId(null); // reset cấp story mỗi khi đổi epic
  }

  function handleToggleStory(storyId: string) {
    setExpandedStoryId(prev => (prev === storyId ? null : storyId));
  }
  ```
- Dữ liệu con (Story/Subtask) nên **lazy-load khi expand lần đầu** (gọi API theo `epicId`/`storyId`), vì tại một thời điểm chỉ cần dữ liệu của tối đa 1 Epic + 1 Story đang mở, không cần preload toàn bộ cây.
- CSS cho đường kẻ cây dùng `border-left` trên 1 wrapper `div` bọc các dòng con, kết hợp `::before`/pseudo-element cho đường ngang nối vào từng dòng — tương tự cách các thư viện tree table (Ant Design Table `expandable`, hoặc TanStack Table với custom render) đang làm.

## Ví dụ khung CSS tham khảo

```css
.tree-row {
  display: flex;
  align-items: center;
  height: 52px;
  position: relative;
}

.tree-row[data-level="1"] { padding-left: 16px; }
.tree-row[data-level="2"] { padding-left: 48px; }
.tree-row[data-level="3"] { padding-left: 80px; }

.tree-connector {
  position: absolute;
  left: 32px; /* điều chỉnh theo level */
  top: 0;
  bottom: 0;
  border-left: 1px solid #E0E0E0;
}

.tree-connector::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  width: 16px;
  border-top: 1px solid #E0E0E0;
}

.chevron-toggle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid #CBD5E1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
}

.chevron-toggle[data-open="true"] {
  border-color: #2563EB;
  color: #2563EB;
}
```

## Deliverable mong muốn từ AI agent

1. Component tree table (React/Vue/component tương ứng với stack hiện tại của dự án) thay thế bảng flat hiện tại.
2. File CSS/SCSS riêng cho phần indent + connector line, không đụng vào style chung của design system.
3. Giữ nguyên toàn bộ logic filter (Project, Status, Issue type, Component/s) và phân trang đang có.
4. Demo với dữ liệu mẫu Epic → Story → Subtask để kiểm tra 3 cấp mở/đóng đúng.
