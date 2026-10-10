/**
 * 'ias'   — chuẩn hoá theo IAS Design System (e:\workspace\ias-design): brand blue
 *           #141ED2, nền #F4F6FA, sidebar navy #0D0D2B, card viền-only 12px,
 *           font Averta Std CY. Là mặc định từ 2026-10-10.
 * 'wise'  — bản thiết kế "Wise-inspired" (lime #9FE870), xem DESIGN.md.
 * 'legacy'— giao diện steel-blue admin nguyên bản, xem design-backup/.
 * 'pink'  — biến thể pastel hồng.
 *
 * Ba brand sau giữ nguyên nhằm không lấy đi lựa chọn nào mà người dùng đang có.
 */
export const THEME_BRANDS = ['ias', 'wise', 'legacy', 'pink'] as const;
export type ThemeBrand = (typeof THEME_BRANDS)[number];

export const THEME_BRAND_STORAGE_KEY = 'ttm-theme-brand';
export const DEFAULT_THEME_BRAND: ThemeBrand = 'ias';

export function isThemeBrand(value: unknown): value is ThemeBrand {
  return typeof value === 'string' && (THEME_BRANDS as readonly string[]).includes(value);
}

export function readStoredThemeBrand(): ThemeBrand {
  if (typeof window === 'undefined') return DEFAULT_THEME_BRAND;
  const stored = window.localStorage.getItem(THEME_BRAND_STORAGE_KEY);
  return isThemeBrand(stored) ? stored : DEFAULT_THEME_BRAND;
}

export function applyThemeBrand(brand: ThemeBrand): void {
  document.documentElement.setAttribute('data-brand', brand);
  window.localStorage.setItem(THEME_BRAND_STORAGE_KEY, brand);
}

/**
 * Inlined as a blocking <script> in the document head (see layout.tsx) so the stored brand
 * applies before first paint — defaults to 'ias' unless a different preference was saved in
 * localStorage. Chỉ honor các brand KHÔNG phải mặc định từ localStorage; mọi giá trị khác
 * (rỗng, cũ, rác) đều rơi về 'ias', nên không cần migration cho người dùng đang lưu 'legacy'
 * — ai đã chủ động chọn "Navy theme" thì vẫn giữ được lựa chọn đó.
 */
export const THEME_BRAND_INIT_SCRIPT = `(function(){try{var b=localStorage.getItem('${THEME_BRAND_STORAGE_KEY}');if(b==='wise'||b==='pink'||b==='legacy'){document.documentElement.setAttribute('data-brand',b);}else{document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');}}catch(e){document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');}})();`;

