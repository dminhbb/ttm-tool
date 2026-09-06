export const BANNER_TYPES = ['DEFAULT', 'PER_SCREEN'] as const;
export type BannerType = (typeof BANNER_TYPES)[number];

export interface InfoBanner {
  bannerType: BannerType;
  createdAt: string;
  endDate: string | null;
  id: number;
  isActive: boolean;
  message: string;
  name: string;
  screenKey: string | null;
  startDate: string;
}

export interface InfoBannerInput {
  bannerType: BannerType;
  endDate: string | null;
  isActive: boolean;
  message: string;
  name: string;
  screenKey: string | null;
  startDate: string;
}

/** What the display component (any authenticated user) gets — just enough to render, no admin
 * metadata (name/dates/type are management-only concerns). */
export type InfoBannerPublic = Pick<InfoBanner, 'id' | 'message'>;
