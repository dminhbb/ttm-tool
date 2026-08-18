export const THEME_BRANDS = ['wise', 'legacy'] as const;
export type ThemeBrand = (typeof THEME_BRANDS)[number];

export const THEME_BRAND_STORAGE_KEY = 'ttm-theme-brand';
export const DEFAULT_THEME_BRAND: ThemeBrand = 'wise';

export function isThemeBrand(value: unknown): value is ThemeBrand {
  return typeof value === 'string' && (THEME_BRANDS as readonly string[]).includes(value);
}

export function readStoredThemeBrand(): ThemeBrand {
  if (typeof window === 'undefined') return DEFAULT_THEME_BRAND;
  const stored = window.localStorage.getItem(THEME_BRAND_STORAGE_KEY);
  return isThemeBrand(stored) ? stored : DEFAULT_THEME_BRAND;
}

export function applyThemeBrand(brand: ThemeBrand): void {
  if (brand === DEFAULT_THEME_BRAND) {
    document.documentElement.removeAttribute('data-brand');
  } else {
    document.documentElement.setAttribute('data-brand', brand);
  }
  window.localStorage.setItem(THEME_BRAND_STORAGE_KEY, brand);
}

/**
 * Inlined as a blocking <script> in the document head (see layout.tsx) so the stored brand
 * applies before first paint — otherwise every load would flash the default Wise theme first.
 * Kept in sync with the constants above by hand since a blocking script can't import a module.
 */
export const THEME_BRAND_INIT_SCRIPT = `(function(){try{var b=localStorage.getItem('${THEME_BRAND_STORAGE_KEY}');if(b==='legacy')document.documentElement.setAttribute('data-brand','legacy');}catch(e){}})();`;
