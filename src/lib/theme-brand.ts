/**
 * 'ias'   — chuẩn hoá theo IAS Design System (e:\workspace\ias-design): brand blue
 *           #141ED2, nền #F4F6FA, sidebar navy #0D0D2B, card viền-only 12px,
 *           font Averta Std CY. Là mặc định từ 2026-10-10.
 * 'wise'  — bản thiết kế "Wise-inspired" (lime #9FE870), xem DESIGN.md.
 * 'legacy'— giao diện steel-blue admin nguyên bản, xem design-backup/.
 * 'pink'  — biến thể pastel hồng.
 *
 * Ba brand sau giữ nguyên nhằm không lấy đi lựa chọn nào mà người dùng đang có.
 *
 * 'mb'    — "MB Theme" (2026-11-27, src/app/mb-theme.css): không phải một bộ token riêng mà là IAS
 *           (data-brand="ias") thêm lớp đè data-skin="mb".
 */
export const THEME_BRANDS = ['ias', 'wise', 'legacy', 'pink'] as const;
export type ThemeBrand = (typeof THEME_BRANDS)[number];
/** Everything the user can pick in "Giao diện". */
export const THEME_CHOICES = [...THEME_BRANDS, 'mb'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_BRAND_STORAGE_KEY = 'ttm-theme-brand';
export const THEME_BRAND_TIMESTAMP_KEY = 'ttm-theme-brand-timestamp';
export const DEFAULT_THEME_BRAND: ThemeBrand = 'ias';
export const THEME_EXPIRY_DAYS = 7;
export const THEME_EXPIRY_MS = THEME_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The <html> attributes of a choice. */
export function themeAttributesOf(choice: ThemeChoice): { brand: ThemeBrand; skin: 'mb' | null } {
  return choice === 'mb' ? { brand: 'ias', skin: 'mb' } : { brand: choice, skin: null };
}

function setThemeAttributes(choice: ThemeChoice): void {
  const { brand, skin } = themeAttributesOf(choice);
  document.documentElement.setAttribute('data-brand', brand);
  if (skin) document.documentElement.setAttribute('data-skin', skin);
  else document.documentElement.removeAttribute('data-skin');
}

/** The choice currently applied to the page. */
export function readAppliedThemeChoice(): ThemeChoice {
  if (document.documentElement.getAttribute('data-skin') === 'mb') return 'mb';
  const brand = document.documentElement.getAttribute('data-brand');
  return isThemeChoice(brand) ? brand : DEFAULT_THEME_BRAND;
}

export function readStoredThemeBrand(): ThemeChoice {
  if (typeof window === 'undefined') return DEFAULT_THEME_BRAND;
  try {
    const stored = window.localStorage.getItem(THEME_BRAND_STORAGE_KEY);
    if (!isThemeChoice(stored)) return DEFAULT_THEME_BRAND;
    if (stored === DEFAULT_THEME_BRAND) return DEFAULT_THEME_BRAND;

    const timestampStr = window.localStorage.getItem(THEME_BRAND_TIMESTAMP_KEY);
    const timestamp = timestampStr ? Number(timestampStr) : 0;
    const now = Date.now();

    // Tự động hoàn tác về IAS theme mặc định sau 7 ngày
    if (timestamp && now - timestamp > THEME_EXPIRY_MS) {
      window.localStorage.setItem(THEME_BRAND_STORAGE_KEY, DEFAULT_THEME_BRAND);
      window.localStorage.removeItem(THEME_BRAND_TIMESTAMP_KEY);
      setThemeAttributes(DEFAULT_THEME_BRAND);
      return DEFAULT_THEME_BRAND;
    }

    if (!timestamp) {
      window.localStorage.setItem(THEME_BRAND_TIMESTAMP_KEY, String(now));
    }

    return stored;
  } catch {
    return DEFAULT_THEME_BRAND;
  }
}

export function applyThemeBrand(brand: ThemeChoice): void {
  setThemeAttributes(brand);
  try {
    window.localStorage.setItem(THEME_BRAND_STORAGE_KEY, brand);
    if (brand === DEFAULT_THEME_BRAND) {
      window.localStorage.removeItem(THEME_BRAND_TIMESTAMP_KEY);
    } else {
      window.localStorage.setItem(THEME_BRAND_TIMESTAMP_KEY, String(Date.now()));
    }
  } catch (error) {
    console.warn('Unable to persist theme brand preference', error);
  }
}

/**
 * Inlined as a blocking <script> in the document head (see layout.tsx) so both the stored brand
 * and appearance mode (light/dark) apply before first paint.
 * Tự động hoàn tác về 'ias' mặc định sau 7 ngày nếu người dùng chọn theme khác.
 */
export const THEME_BRAND_INIT_SCRIPT = `(function(){try{var SEVEN_DAYS=7*24*60*60*1000;var b=localStorage.getItem('${THEME_BRAND_STORAGE_KEY}');var t=Number(localStorage.getItem('${THEME_BRAND_TIMESTAMP_KEY}'));var now=Date.now();if(b&&b!=='${DEFAULT_THEME_BRAND}'&&(b==='wise'||b==='pink'||b==='legacy'||b==='mb')){if(t&&now-t>SEVEN_DAYS){localStorage.setItem('${THEME_BRAND_STORAGE_KEY}','${DEFAULT_THEME_BRAND}');localStorage.removeItem('${THEME_BRAND_TIMESTAMP_KEY}');document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');}else{if(!t){localStorage.setItem('${THEME_BRAND_TIMESTAMP_KEY}',String(now));}if(b==='mb'){document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');document.documentElement.setAttribute('data-skin','mb');}else{document.documentElement.setAttribute('data-brand',b);}}}else{document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');}}catch(e){document.documentElement.setAttribute('data-brand','${DEFAULT_THEME_BRAND}');}try{var m=localStorage.getItem('ttm-monitor.appearance-theme');if(m==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark');}else{document.documentElement.setAttribute('data-theme','light');document.documentElement.classList.remove('dark');}}catch(e){}try{var bd=localStorage.getItem('ttm-monitor.badge-design-style');document.documentElement.setAttribute('data-badge-design',bd==='minimal'?'minimal':'list');}catch(e){document.documentElement.setAttribute('data-badge-design','list');}})();`;

