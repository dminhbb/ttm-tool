/** Fired on `window` after something changes the "Quản lý User" pending count (e.g. registrations marked "Đã đọc"),
 * so AppShell refreshes the left-menu red dot at once instead of on its next 60-second poll. */
export const PENDING_USER_TICKETS_CHANGED_EVENT = 'ttm-pending-user-tickets-changed';
