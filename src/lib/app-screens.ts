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
  '/epic-alerts': { subtitle: 'Cảnh báo TTM-CNTT dựa trên đợt import dữ liệu mới nhất', title: 'Quản trị Epic (rút gọn)' },
  '/epic-alerts-15': { subtitle: 'Cảnh báo TTM-CNTT theo giai đoạn DESIGN/DEV/TEST/PENTEST/R4GOLIVE', title: 'Quản trị Epic' },
  '/epic-in-po': { subtitle: 'Epic đang ở trạng thái To Do, In PO hoặc Released', title: 'Epic in PO' },
  '/admin/domains': { subtitle: 'Quản lý danh mục Domain nghiệp vụ', title: 'Quản lý Domain' },
  '/admin/projects': { subtitle: 'Quản lý danh mục Dự án và mapping với Domain', title: 'Quản lý Dự án' },
  '/admin/holidays': { subtitle: 'Cấu hình ngày nghỉ dùng để tính ngày làm việc', title: 'Cấu hình ngày nghỉ' },
  '/admin/status-alert-rules': { subtitle: 'Thiết lập mốc cảnh báo TTM-CNTT theo loại và trạng thái Epic', title: 'Cấu hình cảnh báo' },
  '/admin/users': { subtitle: 'Quản lý tài khoản, role và trạng thái người dùng', title: 'Quản lý User' },
  '/admin/database': { subtitle: 'Export/Import dữ liệu ứng dụng dưới dạng file SQL', title: 'Sao lưu / Phục hồi dữ liệu' },
  '/admin/permissions': { subtitle: 'Cấu hình quyền Xem/Thêm/Sửa/Xóa theo vai trò cho từng chức năng', title: 'Ma trận phân quyền' },
  '/docs/product': { subtitle: 'Tài liệu trình bày và đào tạo về hệ thống TTM Monitor', title: 'Tài liệu sản phẩm' },
};
