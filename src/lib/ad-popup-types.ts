export interface AdPopup {
  campaignName: string;
  clickUrl: string;
  createdAt: string;
  endDate: string;
  id: number;
  imageUrl: string;
  isActive: boolean;
  maxImpressions: number;
  message: string;
  startDate: string;
  timeoutSeconds: number;
}

export interface AdPopupInput {
  campaignName: string;
  clickUrl: string;
  endDate: string;
  imageUrl: string;
  isActive: boolean;
  maxImpressions: number;
  message: string;
  startDate: string;
  timeoutSeconds: number;
}

/** What the display component (any authenticated user, not just SUPERADMIN) gets — same shape,
 * just a distinct name so the admin-only surface and the display surface can diverge later
 * without one accidentally leaking fields meant only for the other. */
export type AdPopupPublic = Pick<AdPopup, 'campaignName' | 'clickUrl' | 'id' | 'imageUrl' | 'message' | 'timeoutSeconds'>;
