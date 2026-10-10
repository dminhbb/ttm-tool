/**
 * Registry of every routed screen's title/subtitle — used by AppShell for the page header, and by
 * InfoBannersPanel's "màn hình áp dụng" dropdown (a per-screen banner's screenKey is just one of
 * these pathnames). Kept in its own leaf module (no imports) so both can depend on it without a
 * circular import — AppShell → GeneralSettingsModal → InfoBannersPanel would otherwise need to
 * import back from AppShell itself, which throws "Cannot access '...' before initialization" the
 * moment the two modules load in the wrong order.
 */
export interface AppScreenInfo {
  subtitle: string;
  title: string;
}

export const PAGE_HEADERS: Record<string, AppScreenInfo> = {
  '/': { subtitle: 'Kiểm tra và quản lý các lớp dữ liệu Jira nhập vào TTM Monitor', title: 'Quản trị nguồn dữ liệu' },
  '/dashboard': { subtitle: 'Thống kê tổng quan tình trạng TTM theo dự án', title: 'Dashboard' },
  '/dashboard-new': { subtitle: 'Dashboard quản lý cho CBQL/Lead', title: 'TTM dashboard' },
  '/ttm-dashboard-2': { subtitle: 'Biểu đồ phễu luồng dữ liệu và quy tắc lọc Epic', title: 'TTM dashboard 2' },
  '/epic-alerts': { subtitle: 'Cảnh báo TTM-CNTT (QLDA) dựa trên đợt import dữ liệu mới nhất', title: 'Quản trị Epic (rút gọn)' },
  '/epic-alerts-15': { subtitle: 'Cảnh báo TTM-CNTT (QLDA) theo giai đoạn DESIGN/DEV/TEST/PENTEST/R4GOLIVE', title: 'Quản trị Epic' },
  '/epic-in-po': { subtitle: 'Epic đang ở trạng thái To Do, In PO hoặc Released', title: 'Epic in PO' },
  '/admin/domains': { subtitle: 'Quản lý danh mục Domain nghiệp vụ', title: 'Quản lý Domain' },
  '/admin/projects': { subtitle: 'Quản lý danh mục Dự án và mapping với Domain', title: 'Quản lý Dự án' },
  '/admin/holidays': { subtitle: 'Cấu hình ngày nghỉ dùng để tính ngày làm việc', title: 'Cấu hình ngày nghỉ' },
  '/admin/status-alert-rules': { subtitle: 'Thiết lập mốc cảnh báo TTM-CNTT (QLDA) theo loại và trạng thái Epic', title: 'Cấu hình cảnh báo' },
  '/admin/users': { subtitle: 'Quản lý tài khoản, role và trạng thái người dùng', title: 'Quản lý User' },
  '/admin/database': { subtitle: 'Export/Import dữ liệu ứng dụng dưới dạng file SQL', title: 'Sao lưu / Phục hồi dữ liệu' },
  '/admin/permissions': { subtitle: 'Cấu hình quyền Xem/Thêm/Sửa/Xóa theo vai trò cho từng chức năng', title: 'Ma trận phân quyền' },
  '/visit-stats': { subtitle: 'Lượt đăng nhập và lượt sử dụng các màn hình chức năng trên hệ thống', title: 'Thống kê truy cập' },
  '/reports': { subtitle: 'Lựa chọn lớp dữ liệu và các điều kiện lọc', title: 'Báo cáo Epic (beta 2)' },
  '/no-access': { subtitle: 'Vai trò của bạn chưa được cấp quyền Xem màn hình nào', title: 'Chưa có quyền truy cập' },
  '/docs/product': { subtitle: 'Tài liệu trình bày và đào tạo về hệ thống TTM Monitor', title: 'Tài liệu sản phẩm' },

  /* Ba entry dưới đây được thêm 2026-10-10 — SỬA LỖI HIỂN THỊ, không đổi hành vi.
     AppShell lấy tiêu đề theo `PAGE_HEADERS[pathname]` và fallback về `PAGE_HEADERS['/']`
     khi không khớp. Ba route này trước đây không có entry, nên header của chúng hiện
     sai hẳn thành "Quản trị nguồn dữ liệu".

     `/data-review` khớp theo prefix: route thật là `/data-review/[batchId]`, nên không
     có key nào trùng khít — nhưng AppShell cũng không tra prefix, vậy nên entry này
     chỉ đúng khi pathname là `/data-review`. Giữ lại vì nó vô hại và là chỗ để ghi lại
     vấn đề; việc cho AppShell tra theo prefix là thay đổi hành vi, nằm ngoài phạm vi
     đợt chuẩn hoá thuần hình ảnh này. */
  '/data-review': { subtitle: 'Soát dữ liệu Epic của một lớp dữ liệu đã import', title: 'Soát lớp dữ liệu' },
  '/sso/authorize': { subtitle: 'Xác nhận cấp quyền truy cập cho ứng dụng bên ngoài', title: 'Uỷ quyền SSO' },
  '/sso-demo': { subtitle: 'Trang thử nghiệm luồng đăng nhập SSO cho ứng dụng client', title: 'SSO demo' },
};
