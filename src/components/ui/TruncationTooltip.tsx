'use client';

import * as React from 'react';

/**
 * Hiện đầy đủ nội dung của một element bị cắt ellipsis khi hover.
 *
 * Mount MỘT LẦN ở app shell; hoạt động theo kiểu delegated listener trên document,
 * nên mọi element mang `.ias-truncate` hoặc `.ias-td-truncate` đều tự có tooltip mà
 * không phải bọc thêm component hay truyền prop ở từng chỗ.
 *
 * Vì sao không dùng attribute `title` của browser:
 *   - `title` render bằng hộp tooltip của HỆ ĐIỀU HÀNH, không phải bubble navy
 *     (#14142A) của design system, và có độ trễ ~1s không điều khiển được.
 *   - references/components/data/table.md nói rõ phải dùng component Tooltip.
 *
 * Vì sao `position: fixed` chứ không phải `absolute`:
 *   Vùng cuộn của bảng (`.ui-table-wrap`) có `overflow-x: auto`. Theo spec CSS, khi
 *   đặt overflow cho một trục thì trục còn lại thôi là `visible` (nó tính thành
 *   `auto`), nên một bubble `absolute` nằm trong đó sẽ bị CẮT trước khi kịp tràn ra.
 *   Toạ độ vì vậy được tính từ getBoundingClientRect() tại thời điểm hover.
 *
 * Việc này đồng thời KHÔI PHỤC dữ liệu đang bị mất: nhiều ô trong dashboard hiện
 * dùng `truncate` mà không có `title` nào, nên phần chữ bị cắt không có cách nào
 * đọc được.
 */

/** Khoảng cách giữa bubble và ô, đủ để con trỏ không che mất chữ. */
const OFFSET_Y = 8;
/** Lề an toàn với mép viewport, khớp max-width 320px của `.ias-tooltip-bubble`. */
const VIEWPORT_MARGIN = 8;
const MAX_BUBBLE_WIDTH = 320;

/**
 * Mọi marker class được coi là "có thể bị cắt".
 *
 * `.ias-truncate` cho flex/grid child (nhãn KPI, dòng meta trong card…),
 * `.ias-td-truncate` cho ô bảng (thêm `max-width`). Dùng `closest()` nên element
 * lồng sâu bên trong cũng tìm được đúng cha đang bị cắt.
 */
const TRUNCATE_SELECTOR = '.ias-truncate, .ias-td-truncate';

export function TruncationTooltip() {
  const bubbleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    const hide = () => {
      bubble.dataset.open = 'false';
    };

    const show = (cell: HTMLElement) => {
      // Ô không thực sự bị cắt thì không hiện gì — một tooltip chỉ lặp lại đúng
      // chữ đang hiển thị là nhiễu, không phải thông tin (table.md).
      if (cell.scrollWidth <= cell.clientWidth) {
        hide();
        return;
      }

      const text = cell.textContent?.trim();
      if (!text) {
        hide();
        return;
      }

      bubble.textContent = text;
      // Phải hiện trước khi đo: khi đang `display: none` thì offsetWidth/Height = 0.
      bubble.dataset.open = 'true';

      const cellRect = cell.getBoundingClientRect();
      const bubbleWidth = Math.min(bubble.offsetWidth, MAX_BUBBLE_WIDTH);
      const bubbleHeight = bubble.offsetHeight;

      // Ngang: canh theo mép trái của ô, kẹp lại trong viewport.
      const maxLeft = window.innerWidth - bubbleWidth - VIEWPORT_MARGIN;
      bubble.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(cellRect.left, maxLeft))}px`;

      // Dọc: ưu tiên phía dưới ô; nếu không đủ chỗ thì lật lên trên. Với bảng dài,
      // các hàng cuối luôn rơi vào trường hợp lật.
      const spaceBelow = window.innerHeight - cellRect.bottom;
      bubble.style.top =
        spaceBelow >= bubbleHeight + OFFSET_Y + VIEWPORT_MARGIN
          ? `${cellRect.bottom + OFFSET_Y}px`
          : `${Math.max(VIEWPORT_MARGIN, cellRect.top - bubbleHeight - OFFSET_Y)}px`;
    };

    const handlePointerOver = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cell = target.closest<HTMLElement>(TRUNCATE_SELECTOR);
      if (cell) show(cell);
      else hide();
    };

    // `scroll`/`wheel` ở chế độ capture: bubble dùng position:fixed nên nó KHÔNG
    // cuộn theo ô. Không ẩn đi thì nó sẽ treo lơ lửng sai chỗ khi người dùng cuộn.
    document.addEventListener('pointerover', handlePointerOver, { passive: true });
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide, { passive: true });
    window.addEventListener('blur', hide);

    return () => {
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);

  return (
    <div
      ref={bubbleRef}
      className="ias-tooltip-bubble"
      data-open="false"
      role="tooltip"
      // Thuần trình bày: nội dung đã hiển thị sẵn trong ô (chỉ bị cắt bằng CSS), nên
      // screen reader đọc từ chính ô đó. Để trình đọc thấy bubble nữa là đọc lặp.
      aria-hidden="true"
    />
  );
}
