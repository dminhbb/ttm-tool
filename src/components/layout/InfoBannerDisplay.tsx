'use client';

import { useEffect, useState } from 'react';
import { Info } from '@phosphor-icons/react';
import { sanitizeAdPopupHtml } from '@/lib/sanitize-html';
import type { InfoBannerPublic } from '@/lib/info-banner-types';

interface ActiveInfoBanners {
  defaultBanner: InfoBannerPublic | null;
  screenBanner: InfoBannerPublic | null;
}

const EMPTY: ActiveInfoBanners = { defaultBanner: null, screenBanner: null };

/**
 * "Information banner" strip — configured under "Quản lý chung" → "Banner thông báo".
 * `pathname` is the current screen's own key (e.g. "/epic-alerts-15", matching PAGE_HEADERS/
 * InfoBannersPanel's screen dropdown) — pass a literal string for a static route. Each page mounts
 * this wherever its own layout wants the banner to sit (there's no single spot that fits every
 * page's structure, so this isn't mounted globally in AppShell). Renders the DEFAULT banner
 * (site-wide) above the current screen's own PER_SCREEN banner, if any — either, both, or neither,
 * and never a placeholder for one that doesn't apply here (an inactive/out-of-range default just
 * isn't rendered at all, not shown as an empty box). The DEFAULT banner's (i) icon renders in the
 * vivid accent color; a PER_SCREEN banner's icon stays muted — see .ui-info-banner--default.
 */
export function InfoBannerDisplay({ pathname }: { pathname: string }) {
  const [banners, setBanners] = useState<ActiveInfoBanners>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/info-banners/active?screenKey=${encodeURIComponent(pathname)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : EMPTY))
      .then((data: ActiveInfoBanners) => { if (!cancelled) setBanners(data); })
      .catch(() => { if (!cancelled) setBanners(EMPTY); });
    return () => { cancelled = true; };
  }, [pathname]);

  const items = [
    banners.defaultBanner && { banner: banners.defaultBanner, isDefault: true },
    banners.screenBanner && { banner: banners.screenBanner, isDefault: false },
  ].filter((item): item is { banner: InfoBannerPublic; isDefault: boolean } => Boolean(item));

  if (items.length === 0) return null;

  return (
    <>
      {items.map(({ banner, isDefault }) => (
        <div key={banner.id} className={`ui-info-banner${isDefault ? ' ui-info-banner--default' : ''}`} role="status">
          <Info className="ui-info-banner-icon" size={20} weight="regular" aria-hidden="true" />
          <div dangerouslySetInnerHTML={{ __html: sanitizeAdPopupHtml(banner.message) }} />
        </div>
      ))}
    </>
  );
}
