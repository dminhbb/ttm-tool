import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'danger' | 'warning' | 'pending' | 'info' | 'neutral' | 'todo';
  /**
   * Hiện dot dẫn trước nhãn. Rule cross-cutting của IAS yêu cầu trạng thái phải là
   * "dot + badge-shape + label", không bao giờ chỉ là chữ đổi màu
   * (references/component-rules.md) — vừa để nhận diện, vừa để không truyền đạt
   * thông tin chỉ bằng màu.
   *
   * Mặc định `false` để không đổi diện mạo các chỗ `Badge` đang được dùng làm chip
   * ĐẾM hoặc MÃ thay vì trạng thái (ví dụ `<Badge variant="neutral">` hiển thị số
   * lượng) — theo IAS những chỗ đó thuộc về `Tag`, và dot sẽ là sai. Việc bật `dot`
   * cho đúng các badge trạng thái được làm theo từng màn hình ở Nhịp B.
   */
  dot?: boolean;
  /**
   * Hình khối. IAS mặc định `rectangle` (radius 4px) cho Badge trạng thái, đổi từ
   * 2026-09-15; `pill` chỉ dùng khi một badge trạng thái cụ thể cần dáng tròn.
   * Lưu ý: đặt `pill` KHÔNG biến Badge thành Tag — nếu thứ đang gắn nhãn là phân
   * loại/bộ lọc chứ không phải trạng thái thì phải dùng Tag (class `.ias-tag`).
   */
  shape?: 'rectangle' | 'pill';
}

export const Badge = ({
  className,
  variant = 'neutral',
  dot = false,
  shape = 'rectangle',
  ...props
}: BadgeProps) => {
  return (
    <span
      className={cn(
        'ui-badge shrink-0 whitespace-nowrap select-none',
        dot && 'ui-badge-dot',
        shape === 'pill' && 'ui-badge-pill',
        {
          'bg-fb-blue-soft text-fb-blue': variant === 'info',
          'bg-status-success-soft text-status-success': variant === 'success' || variant === 'todo',
          'bg-status-danger-soft text-status-danger': variant === 'danger',
          'bg-status-warning-soft text-status-warning': variant === 'warning' || variant === 'pending',
          'border border-fb-border bg-fb-surface-muted text-fb-text-secondary': variant === 'neutral',
        },
        className
      )}
      {...props}
    />
  );
};

Badge.displayName = 'Badge';
