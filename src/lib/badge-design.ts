import * as React from 'react';

/**
 * Thiết kế hiển thị tại cột "Nhận xét" trên màn hình Quản trị Epic (owner 2026-10-26):
 * - 'list'    ("Liệt kê"): hiển thị tất cả các badge của Epic với màu nền theo nhóm, sắp xếp thông minh ít xuống dòng (mặc định).
 * - 'minimal' ("Tối giản"): gom thành thanh 1x4 ô theo nhóm (Kết quả / Xử lý / Cảnh báo / Sai lệch dữ liệu) và mở box chi tiết bên dưới.
 */
export const BADGE_DESIGN_STYLES = ['list', 'minimal'] as const;
export type BadgeDesignStyle = (typeof BADGE_DESIGN_STYLES)[number];

export const DEFAULT_BADGE_DESIGN_STYLE: BadgeDesignStyle = 'list';
export const BADGE_DESIGN_STORAGE_KEY = 'ttm-monitor.badge-design-style';

export function isBadgeDesignStyle(value: unknown): value is BadgeDesignStyle {
  return typeof value === 'string' && (BADGE_DESIGN_STYLES as readonly string[]).includes(value);
}

function userStorageKey(userEmail?: string | null): string | null {
  const normalized = userEmail?.trim().toLowerCase();
  return normalized ? `${BADGE_DESIGN_STORAGE_KEY}:${normalized}` : null;
}

export function readStoredBadgeDesignStyle(userEmail?: string | null): BadgeDesignStyle {
  if (typeof window === 'undefined') return DEFAULT_BADGE_DESIGN_STYLE;
  try {
    const perUserKey = userStorageKey(userEmail);
    if (perUserKey) {
      const perUserValue = window.localStorage.getItem(perUserKey);
      if (isBadgeDesignStyle(perUserValue)) return perUserValue;
    }
    const stored = window.localStorage.getItem(BADGE_DESIGN_STORAGE_KEY);
    return isBadgeDesignStyle(stored) ? stored : DEFAULT_BADGE_DESIGN_STYLE;
  } catch {
    return DEFAULT_BADGE_DESIGN_STYLE;
  }
}

export function applyBadgeDesignStyle(style: BadgeDesignStyle, userEmail?: string | null): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-badge-design', style);
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BADGE_DESIGN_STORAGE_KEY, style);
    const perUserKey = userStorageKey(userEmail);
    if (perUserKey) {
      window.localStorage.setItem(perUserKey, style);
    }
  } catch (error) {
    console.warn('Unable to persist badge design preference.', error);
  }
}

function subscribeToBadgeDesignAttribute(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-badge-design'] });
  return () => observer.disconnect();
}

function readAppliedBadgeDesignStyle(): BadgeDesignStyle {
  if (typeof document === 'undefined') return DEFAULT_BADGE_DESIGN_STYLE;
  const attr = document.documentElement.getAttribute('data-badge-design');
  if (isBadgeDesignStyle(attr)) return attr;
  return readStoredBadgeDesignStyle();
}

export function useBadgeDesignStyle(): BadgeDesignStyle {
  return React.useSyncExternalStore(
    subscribeToBadgeDesignAttribute,
    readAppliedBadgeDesignStyle,
    () => DEFAULT_BADGE_DESIGN_STYLE,
  );
}
