// "Tạm dừng hệ thống" (owner 2026-11-08): a SUPERADMIN switch that cuts every user below SUPERADMIN off the app. While it
// is ON the proxy sends them to the full-screen page /suspended; only these stay reachable:
//   - signing in (the login API then lets a non-SUPERADMIN in only when "Bản tin" is an exception — see the login route);
//   - "Bản tin" (+ the left panel's avatar menu) when allow_news_letter is ticked;
//   - the MCP Server for AI chatbots when allow_mcp is ticked (checked inside /api/mcp, which authenticates by token);
//   - the machine-to-machine import API, so the daily data keeps flowing.
// Pure module (no database import) so the proxy, the screens and the tests share it.

export const SUSPENDED_PATH = '/suspended';
export const NEWS_LETTER_PATH = '/news-letter';

/** Fired in the tab after the settings are saved, so the shell re-reads the state at once (reminder strip). */
export const SYSTEM_SUSPENSION_CHANGED_EVENT = 'ttm:system-suspension-changed';

/** `code` of an API answer refused because the system is suspended. */
export const SYSTEM_SUSPENDED_CODE = 'SYSTEM_SUSPENDED';
/** What a non-SUPERADMIN sees when signing in while "Bản tin" is not an exception. */
export const SYSTEM_SUSPENDED_LOGIN_MESSAGE = 'Hệ thống đang tạm dừng!';
export const SYSTEM_SUSPENDED_API_MESSAGE = 'Hệ thống đang tạm dừng — chức năng này tạm thời không truy cập được.';
/** Shown on /suspended when the SUPERADMIN left the text empty. */
export const DEFAULT_SUSPENSION_MESSAGE_HTML = '<p>Hệ thống đang tạm dừng để bảo trì. Vui lòng quay lại sau.</p>';
/** Longest HTML accepted for the message (before and after sanitizing). */
export const SUSPENSION_MESSAGE_MAX_LENGTH = 20_000;

export interface SystemSuspensionState {
  allowMcp: boolean;
  allowNewsLetter: boolean;
  isSuspended: boolean;
  messageHtml: string;
  suspendedAt: string | null;
  updatedAt: string | null;
}

export const NOT_SUSPENDED: SystemSuspensionState = {
  allowMcp: false,
  allowNewsLetter: false,
  isSuspended: false,
  messageHtml: '',
  suspendedAt: null,
  updatedAt: null,
};

/** What /api/system/suspension tells anyone, signed in or not. Nothing but the page's own content. */
export interface PublicSystemSuspension {
  allowMcp: boolean;
  allowNewsLetter: boolean;
  isSuspended: boolean;
  /** State of the existing "MCP Server" switch (Quản trị hệ thống → MCP Server), shown as ON / OFF. */
  mcpEnabled: boolean;
  messageHtml: string;
}

/** A SUPERADMIN — also while in "View as" (only a SUPERADMIN session can carry viewAs) — is never suspended. */
export function isSuspensionExempt(user: { role: string; viewAs?: unknown } | null | undefined): boolean {
  return Boolean(user && (user.role === 'SUPERADMIN' || user.viewAs));
}

/** Entries are exact paths, or 'base/*' for the base path and everything under it. */
function matchesAny(pathname: string, entries: readonly string[]): boolean {
  return entries.some((entry) => {
    if (!entry.endsWith('/*')) return pathname === entry;
    const base = entry.slice(0, -2);
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}

/** Open to everyone while suspended. The routes behind them check the rest themselves. */
const ALWAYS_OPEN: readonly string[] = [
  SUSPENDED_PATH,
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/captcha',
  '/api/system/status',
  '/api/system/suspension',
  // Python export script (own bearer token): the data keeps flowing during the pause.
  '/api/data-source/import/auto',
  // MCP: /api/mcp refuses a non-SUPERADMIN token itself unless the MCP exception is ticked (it authenticates by token,
  // so the proxy cannot tell who is calling); the OAuth front door checks the same in its authorize step.
  '/api/mcp',
  '/api/mcp/oauth/*',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
];

/** "Bản tin" itself — screens and their API (a visitor not signed in is sent to /login by the normal flow). */
const NEWS_LETTER_PATHS: readonly string[] = [`${NEWS_LETTER_PATH}/*`, '/api/news-letter/*'];

/** What the shell and the avatar menu ("đầy đủ chức năng") need around "Bản tin", for a signed-in user. */
const NEWS_LETTER_SHELL_PATHS: readonly string[] = [
  '/api/auth/me',
  '/api/auth/profile',
  '/api/auth/change-password',
  '/api/rule-group-summary',
  '/api/mcp-tokens/*',
  '/api/usage-stats/track',
  '/api/visit-counter/footer',
  '/api/visit-counter/track',
  '/docs/product',
  '/docs/product-guide.html',
];

export type SuspensionAccess = { kind: 'allow' } | { kind: 'api-blocked' } | { kind: 'redirect'; to: string };

/**
 * What the proxy does with a request of a NON-exempt user (or a visitor) while the system is suspended. 'allow' only means
 * "not stopped by the suspension": the normal sign-in and permission checks still apply after it.
 */
export function suspensionAccessFor(pathname: string, options: { allowNewsLetter: boolean; signedIn: boolean }): SuspensionAccess {
  // '/__nextjs…' = Next.js dev overlay helpers (development only).
  if (pathname.startsWith('/__nextjs') || matchesAny(pathname, ALWAYS_OPEN)) return { kind: 'allow' };
  if (options.allowNewsLetter) {
    if (matchesAny(pathname, NEWS_LETTER_PATHS)) return { kind: 'allow' };
    if (options.signedIn && matchesAny(pathname, NEWS_LETTER_SHELL_PATHS)) return { kind: 'allow' };
  }
  if (pathname.startsWith('/api/')) return { kind: 'api-blocked' };
  return { kind: 'redirect', to: options.signedIn && options.allowNewsLetter ? NEWS_LETTER_PATH : SUSPENDED_PATH };
}
