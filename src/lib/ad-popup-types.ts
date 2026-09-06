export interface AdPopup {
  campaignName: string;
  clickUrl: string;
  createdAt: string;
  endDate: string;
  /** "Bắt buộc xem" — no X button and no auto-dismiss until timeoutSeconds elapses, then the X
   * appears so the user can close it manually. False (default): auto-dismiss + X always visible. */
  forceView: boolean;
  heightPercent: number | null;
  id: number;
  imageUrl: string;
  isActive: boolean;
  maxImpressions: number;
  message: string;
  startDate: string;
  timeoutSeconds: number;
  widthPercent: number | null;
}

export interface AdPopupInput {
  campaignName: string;
  clickUrl: string;
  endDate: string;
  forceView: boolean;
  heightPercent: number | null;
  imageUrl: string;
  isActive: boolean;
  maxImpressions: number;
  message: string;
  startDate: string;
  timeoutSeconds: number;
  widthPercent: number | null;
}

/** What the display component (any authenticated user, not just SUPERADMIN) gets — same shape,
 * just a distinct name so the admin-only surface and the display surface can diverge later
 * without one accidentally leaking fields meant only for the other. */
export type AdPopupPublic = Pick<AdPopup, 'campaignName' | 'clickUrl' | 'forceView' | 'heightPercent' | 'id' | 'imageUrl' | 'message' | 'timeoutSeconds' | 'widthPercent'>;
