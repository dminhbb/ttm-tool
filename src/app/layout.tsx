import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { THEME_BRAND_INIT_SCRIPT } from '@/lib/theme-brand';

/**
 * Averta Std CY — font brand của IAS Design System, self-hosted.
 *
 * Đã qua cửa kiểm chứng ở `scripts/check-font-vietnamese.mjs`: phủ 100% cả 134 codepoint
 * tiếng Việt bắt buộc (đáng kiểm vì "CY" là biến thể Cyrillic — một font Cyrillic thiếu
 * khối Latin Extended Additional sẽ khiến browser fallback THEO TỪNG GLYPH, chữ có dấu
 * render bằng font khác ngay trong cùng một từ). Regression test:
 * `src/lib/design-system/__tests__/font-vietnamese.test.ts`.
 *
 * File WOFF2 sinh bởi `python scripts/build-brand-font.py` (subset Latin+Vietnamese,
 * ~30KB/weight thay vì ~131KB mỗi file .otf gốc).
 *
 * CHỈ CÓ 3 WEIGHT: bộ Averta Std CY không phát hành Medium (500) — các file có sẵn là
 * 100/200/300/400/600/700/800/900. Type scale của IAS dùng 500 cho H4/H5/Body1/Caption,
 * nên theo thuật toán khớp font của CSS (đích 500 → duyệt các weight ≤ 500 giảm dần)
 * weight 500 render bằng Regular 400. Đây KHÔNG phải faux-bold do browser tổng hợp, và
 * là giới hạn của chính bộ font brand.
 */
const averta = localFont({
  src: [
    { path: './fonts/averta-std-cy-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/averta-std-cy-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/averta-std-cy-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-averta',
  display: 'swap',
  // Giảm nhảy layout khi font brand vừa tải xong thay cho font hệ thống. Số đo từ
  // chính file font: unitsPerEm 1000, ascender 800, descender -200, capHeight 700.
  fallback: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
});

// Wise Sans is proprietary; Inter at weight 900 is the brief's own recommended substitute for
// the brand's heavy display voice, and doubles as the body/UI face (DESIGN.md Typography note).
// Giữ lại cho brand `wise` — brand `ias` dùng Averta ở trên.
const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
});

// Kept loaded (not just its CSS values) so "Giao diện cũ" in AppearancePanel can restore the
// original typeface, not just the original colors/radius.
const geistSans = Geist({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'TTM Monitor - Quản trị nguồn dữ liệu',
  description: 'Hệ thống giám sát Time to Market của các yêu cầu Epic',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Applies a stored "legacy" brand preference before first paint — without this, every
            load would flash the default Wise theme before React hydrates and can re-apply it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BRAND_INIT_SCRIPT }} />
      </head>
      {/* `font-sans` đã được BỎ khỏi đây (sửa 2026-10-10).
          Nó là class selector (specificity 0-1-0) nên đè `body { font-family: ... }` trong
          globals.css (0-0-1), khiến app âm thầm render bằng ui-sans-serif/system-ui
          (Segoe UI trên Windows) thay vì font đã preload. Metric chữ Việt của Segoe UI rộng
          hơn, nên mọi con số px cứng (`w-9`, `max-w-[100px]`, `min-w-[1160px]`,
          `grid-cols-[0.62fr…]`) đều lệch so với lúc thiết kế — một tác nhân hệ thống của lỗi
          tràn chữ. Cùng lỗi này làm `[data-brand="legacy"] body` và `[data-brand="pink"] body`
          chưa từng có hiệu lực, tức chức năng "khôi phục typeface giao diện cũ" chưa từng chạy.
          Giờ font-family do `body {}` + các khối brand trong globals.css quyết định. */}
      <body className={`${averta.variable} ${inter.variable} ${geistSans.variable} ${geistMono.variable} min-h-[100dvh] antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
