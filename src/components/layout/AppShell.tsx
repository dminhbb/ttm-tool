'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { USER_ROLES, type UserRole } from '@/lib/auth-types';
import { PAGE_HEADERS } from '@/lib/app-screens';
import { PERMISSION_MATRIX_CHANGED_EVENT } from '@/lib/permission-matrix-types';
import { EpicHeaderWidgetsProvider, useEpicHeaderWidgets } from '@/lib/epic-header-widgets-context';
import {
  Bandaids,
  BriefcaseMetal,
  Browser,
  Browsers,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretRight,
  ChartLineUp,
  ChartPie,
  ClockCounterClockwise,
  Database,
  Faders,
  FileText,
  Funnel,
  Gauge,
  GearSix,
  Globe,
  List,
  Lock,
  Prohibit,
  Pulse,
  ShareNetwork,
  SlidersHorizontal,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { trackFeatureUsage } from '@/lib/usage-tracking';
import { Tooltip } from '@/components/ui/Tooltip';
import { UserMenu } from '@/components/layout/UserMenu';
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal';
import { AppConfigModal } from '@/components/settings/AppConfigModal';
import { SystemAdminModal } from '@/components/settings/SystemAdminModal';
import { BlackListedEpicsModal } from '@/components/settings/BlackListedEpicsModal';
import { AdPopupDisplay } from '@/components/layout/AdPopupDisplay';
import { DailyCacheWarmer } from '@/components/layout/DailyCacheWarmer';
import { SystemStatusFooter } from '@/components/layout/SystemStatusFooter';
import { showToast, ToastProvider } from '@/components/ui/Toast';
import { fallbackPathFor, pageFeatureKey } from '@/lib/feature-access';
import { resolveScreenKeyFromPathname, trackScreenVisit } from '@/lib/visit-counter-client';

type NavigationModal = 'appConfig' | 'blackListedEpics' | 'systemAdmin';

interface NavigationItem {
  disabled?: boolean;
  /** `permission_features.feature_key` this entry belongs to. Unticking "Xem" for a role in
   * Ma trận phân quyền hides the entry for that role — on top of `roles`, never instead of it. */
  featureKey?: string;
  href?: string;
  icon: Icon;
  label: string;
  /** Set on entries that open a popup (rendered once by AppShell) instead of navigating. */
  modal?: NavigationModal;
  onClick?: () => void;
  /** Omitted = every authenticated role. Matches the permission matrix (see AGENTS.md-adjacent docs). */
  roles?: UserRole[];
}

/** A sidebar entry that opens a popup submenu instead of navigating. `roles` gates the whole
 * group; each child keeps its own `roles` on top of that, and a group left with no visible
 * child is dropped (see visibleNavigationFor). */
interface NavigationGroup {
  icon: Icon;
  items: NavigationItem[];
  label: string;
  roles?: UserRole[];
}

type NavigationEntry = NavigationItem | NavigationGroup;

interface NavigationSection {
  items: NavigationEntry[];
  label: string;
}

function isNavigationGroup(entry: NavigationEntry): entry is NavigationGroup {
  return 'items' in entry;
}

interface SidebarContentProps {
  expanded: boolean;
  onNavigate?: () => void;
  onOpenModal: (modal: NavigationModal) => void;
  onToggle?: () => void;
  /** Permission-matrix features whose "Xem" is unticked for the current role. */
  hiddenFeatureKeys: ReadonlySet<string>;
  /** Pending password-reset + inactive-registration tickets — drives the red dot on "Quản lý User". */
  pendingUserTicketsCount: number;
  role: UserRole | null;
}

export interface AppShellProps {
  children: React.ReactNode;
}

// Admin config/monitoring screens: SUPERADMIN and SUPERVISOR both see everything here (SUPERVISOR
// is read-only — enforced by the API's per-method role checks, not by hiding nav items — ADMIN
// keeps its existing scoped edit rights unchanged).
const ADMIN_VIEW_ROLES: UserRole[] = ['ADMIN', 'SUPERADMIN', 'SUPERVISOR'];
const SUPERADMIN_OR_SUPERVISOR: UserRole[] = ['SUPERADMIN', 'SUPERVISOR'];
// Data-processing screens (raw import/backup/restore/cleanup) — SUPERVISOR has zero access here,
// not even view, unlike the admin config screens above.
const SUPERADMIN_ONLY: UserRole[] = ['SUPERADMIN'];


const navigation: NavigationSection[] = [
  {
    label: 'Giám sát',
    items: [
      { href: '/reports', featureKey: 'epic_reports', icon: Bandaids, label: 'Báo cáo Epic (beta 2)' },
      // Landing page after sign-in, open to every role (permission matrix feature 'ttm_dashboard_2').
      { href: '/ttm-dashboard-2', featureKey: 'ttm_dashboard_2', icon: Funnel, label: 'TTM dashboard 2' },
      // SUPERADMIN only since 2026-10-05 (permission matrix feature 'dashboard_new').
      { href: '/dashboard-new', featureKey: 'dashboard_new', icon: ChartPie, label: 'TTM dashboard', roles: SUPERADMIN_ONLY },
      // { href: '/dashboard', icon: Gauge, label: 'Dashboard' },
      // { href: '/epic-alerts', icon: Browser, label: 'Quản trị Epic (rút gọn)', roles: ADMIN_VIEW_ROLES },
      { href: '/epic-alerts-15', featureKey: 'epic_alerts_15', icon: Browsers, label: 'Quản trị Epic' },
      { href: '/epic-in-po', featureKey: 'epic_in_po', icon: BriefcaseMetal, label: 'Epic in PO' },
      // Open to every role (permission matrix feature 'visit_counter' is View for all roles).
      { href: '/visit-stats', featureKey: 'visit_counter', icon: ChartLineUp, label: 'Thống kê truy cập' },
    ],
  },
  {
    label: 'Quản trị',
    // Admin screens are gathered into two popup submenus so the sidebar stays short (a SUPERADMIN
    // used to get nine separate entries here). Grouping changes nothing about who may open what:
    // every child keeps the `roles` it had as a flat entry.
    items: [
      {
        icon: Faders,
        label: 'Admin: Cấu hình ứng dụng',
        roles: ADMIN_VIEW_ROLES,
        items: [
          { href: '/admin/users', featureKey: 'users', icon: Users, label: 'Quản lý User', roles: ADMIN_VIEW_ROLES },
          { href: '/admin/projects', featureKey: 'projects', icon: ShareNetwork, label: 'Quản lý Dự án', roles: ADMIN_VIEW_ROLES },
          { href: '/admin/domains', featureKey: 'domains', icon: Globe, label: 'Quản lý Domain', roles: ADMIN_VIEW_ROLES },
          { href: '/admin/status-alert-rules', featureKey: 'status_alert_rules', icon: Warning, label: 'Cấu hình cảnh báo', roles: SUPERADMIN_OR_SUPERVISOR },
          // "Epic ngoại lệ" (black listed Epics) — SUPERVISOR opens it read-only, like the screens above.
          { icon: Prohibit, label: 'Epic ngoại lệ', modal: 'blackListedEpics', roles: ADMIN_VIEW_ROLES },
          { featureKey: 'general_settings', icon: GearSix, label: 'Cấu hình ứng dụng', modal: 'appConfig', roles: ADMIN_VIEW_ROLES },
        ],
      },
      {
        icon: GearSix,
        label: 'SuperAdmin: Quản trị hệ thống',
        // SUPERVISOR is deliberately excluded (owner decision 2026-10-05): view-only on the Admin
        // group above, no access at all — not even view — to anything in this one.
        roles: SUPERADMIN_ONLY,
        items: [
          { href: '/', featureKey: 'data_source', icon: Database, label: 'Nguồn dữ liệu', roles: SUPERADMIN_ONLY },
          { href: '/admin/database', featureKey: 'database_backup', icon: ClockCounterClockwise, label: 'Sao lưu / Phục hồi dữ liệu', roles: SUPERADMIN_ONLY },
          { href: '/admin/permissions', featureKey: 'permission_matrix', icon: Lock, label: 'Ma trận phân quyền', roles: SUPERADMIN_ONLY },
          { icon: GearSix, label: 'Quản trị hệ thống', modal: 'systemAdmin', roles: SUPERADMIN_ONLY },
        ],
      },
    ],
  },
];

function roleAllowed(roles: UserRole[] | undefined, role: UserRole | null): boolean {
  return !roles || (role !== null && roles.includes(role));
}

const NO_HIDDEN_FEATURES: ReadonlySet<string> = new Set();

/** Every "Quản trị" item needs at least ADMIN, so a plain USER always ends up with an
 * empty section — dropped entirely rather than shown as a header with nothing under it.
 * Same for a group whose children are all out of reach for the role.
 * `hiddenFeatureKeys` (permission matrix, "Xem" unticked) only ever removes entries: it narrows
 * what `roles` already allows and can't reveal a screen the role has no access to. */
function visibleNavigationFor(role: UserRole | null, hiddenFeatureKeys: ReadonlySet<string>): NavigationSection[] {
  const itemVisible = (item: NavigationItem) => roleAllowed(item.roles, role) && !(item.featureKey && hiddenFeatureKeys.has(item.featureKey));
  return navigation
    .map((section) => ({
      ...section,
      items: section.items.flatMap((entry): NavigationEntry[] => {
        if (!isNavigationGroup(entry)) return itemVisible(entry) ? [entry] : [];
        if (!roleAllowed(entry.roles, role)) return [];
        const items = entry.items.filter(itemVisible);
        return items.length > 0 ? [{ ...entry, items }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

interface NavigationGroupMenuProps {
  expanded: boolean;
  group: NavigationGroup;
  onNavigate?: () => void;
  onOpenModal: (modal: NavigationModal) => void;
  pendingUserTicketsCount: number;
}

/** Gap between the trigger and its popup — wide enough to clear the sidebar's own padding/border. */
const GROUP_POPUP_GAP = 12;
const GROUP_POPUP_VIEWPORT_MARGIN = 8;

function NavigationGroupMenu({ expanded, group, onNavigate, onOpenModal, pendingUserTicketsCount }: NavigationGroupMenuProps) {
  const pathname = usePathname();
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const GroupIcon = group.icon;
  const active = group.items.some((item) => !!item.href && pathname === item.href);
  const hasPendingTickets = pendingUserTicketsCount > 0 && group.items.some((item) => item.href === '/admin/users');

  // Portalled + fixed (the <nav> scrolls, so an absolutely positioned popup would be clipped).
  // Opens to the right of the trigger; in the mobile drawer there's no room there, so it drops
  // below instead. Positioned by writing styles directly — it only needs measuring once per open.
  React.useLayoutEffect(() => {
    if (!open || !buttonRef.current || !popupRef.current) return;
    const trigger = buttonRef.current.getBoundingClientRect();
    const popup = popupRef.current;
    const { height, width } = popup.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - GROUP_POPUP_VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - height - GROUP_POPUP_VIEWPORT_MARGIN;
    const fitsRight = trigger.right + GROUP_POPUP_GAP <= maxLeft;
    const left = fitsRight ? trigger.right + GROUP_POPUP_GAP : Math.min(trigger.left, maxLeft);
    const top = fitsRight ? trigger.top : trigger.bottom + 4;
    popup.style.left = `${Math.max(GROUP_POPUP_VIEWPORT_MARGIN, left)}px`;
    popup.style.top = `${Math.max(GROUP_POPUP_VIEWPORT_MARGIN, Math.min(top, maxTop))}px`;
    popup.style.visibility = 'visible';
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !popupRef.current?.contains(target)) close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const popupItemClassName = (itemActive: boolean) => cn(
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left outline-none transition-colors',
    itemActive ? 'bg-fb-blue-soft text-fb-blue' : 'text-fb-text-primary hover:bg-fb-control',
  );
  // Font utilities sit on the label, not on the row: globals.css has an unlayered
  // `button { font: inherit }`, which beats Tailwind's layered utilities on a <button> row but not
  // on a <Link> row — that is what made the popup's modal entries look different from its links.
  const labelClassName = 'text-sm font-semibold leading-tight';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-10 w-full items-center rounded-md text-left outline-none transition-[background-color,color]',
          expanded ? 'gap-3 px-3 py-1.5' : 'justify-center px-2',
          active || open ? 'bg-fb-blue-soft text-fb-blue' : 'text-sidebar-text hover:bg-fb-control hover:text-fb-text-primary',
        )}
        aria-label={!expanded ? group.label : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        title={!expanded && !open ? group.label : undefined}
      >
        <span className="relative inline-flex shrink-0">
          <GroupIcon className="size-5 shrink-0" weight={active ? 'fill' : 'bold'} aria-hidden="true" />
          {hasPendingTickets && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-status-danger ring-2 ring-fb-surface" aria-hidden="true" />
          )}
        </span>
        {expanded && <span className={cn('min-w-0 flex-1', labelClassName)}>{group.label}</span>}
        {expanded && <CaretRight className="size-3.5 shrink-0" weight="bold" aria-hidden="true" />}
        {hasPendingTickets && <span className="sr-only"> (có ticket đang chờ xử lý)</span>}
      </button>
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[60] min-w-60 rounded-lg border border-fb-border bg-fb-surface p-1 shadow-dialog"
          style={{ left: 0, top: 0, visibility: 'hidden' }}
          role="menu"
          aria-label={group.label}
        >
          <p className="px-3 py-2 text-xs font-bold text-fb-text-secondary">{group.label}</p>
          <div className="my-1 border-t border-fb-border" role="separator" />
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const itemActive = !!item.href && pathname === item.href;
            const itemHasPendingTickets = item.href === '/admin/users' && pendingUserTicketsCount > 0;
            const content = (
              <>
                <ItemIcon className="size-4 shrink-0" weight={itemActive ? 'fill' : 'bold'} aria-hidden="true" />
                <span className={labelClassName}>{item.label}</span>
                {itemHasPendingTickets && <span className="ml-auto size-2 shrink-0 rounded-full bg-status-danger" aria-hidden="true" />}
                {itemHasPendingTickets && <span className="sr-only"> (có ticket đang chờ xử lý)</span>}
              </>
            );
            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => { trackFeatureUsage(); setOpen(false); onNavigate?.(); }}
                  className={popupItemClassName(itemActive)}
                  aria-current={itemActive ? 'page' : undefined}
                  role="menuitem"
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  trackFeatureUsage();
                  setOpen(false);
                  if (item.modal) onOpenModal(item.modal);
                  onNavigate?.();
                }}
                className={popupItemClassName(false)}
                role="menuitem"
              >
                {content}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

function SidebarContent({ expanded, hiddenFeatureKeys, onNavigate, onOpenModal, onToggle, pendingUserTicketsCount, role }: SidebarContentProps) {
  const pathname = usePathname();
  const sections = visibleNavigationFor(role, hiddenFeatureKeys);

  return (
    <>
      <div className={cn('flex h-16 items-center border-b border-fb-border', expanded ? 'gap-3 px-4' : 'justify-center px-2')}>
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-fb-primary text-fb-on-primary">
          <Pulse className="size-5" weight="bold" aria-hidden="true" />
        </div>
        {expanded && (
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-[-0.02em] text-fb-text-primary">TTM Monitor</p>
            <p className="text-[9px] font-medium text-sidebar-muted">Theo dõi Time to Market</p>
          </div>
        )}
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-4', expanded ? 'px-3' : 'px-2')} aria-label="Điều hướng chính">
        {sections.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            {expanded ? (
              <p className="mb-1.5 px-3 text-[9px] font-bold tracking-wide text-sidebar-muted">{section.label}</p>
            ) : (
              <div className="mx-2 mb-2 h-px bg-fb-border" aria-hidden="true" />
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                if (isNavigationGroup(item)) {
                  return (
                    <li key={item.label}>
                      <NavigationGroupMenu
                        expanded={expanded}
                        group={item}
                        onNavigate={onNavigate}
                        onOpenModal={onOpenModal}
                        pendingUserTicketsCount={pendingUserTicketsCount}
                      />
                    </li>
                  );
                }
                const ItemIcon = item.icon;
                const active = !!item.href && pathname === item.href;
                const sharedClassName = cn(
                  'flex min-h-10 w-full items-center rounded-md text-left text-sm font-semibold outline-none transition-[background-color,color]',
                  expanded ? 'gap-3 px-3' : 'justify-center px-2',
                  active && 'bg-fb-blue-soft text-fb-blue',
                  !active && !item.disabled && 'text-sidebar-text hover:bg-fb-control hover:text-fb-text-primary',
                  item.disabled && 'cursor-not-allowed text-sidebar-disabled',
                );
                const hasPendingTickets = item.href === '/admin/users' && pendingUserTicketsCount > 0;
                const content = (
                  <>
                    <span className="relative inline-flex shrink-0">
                      <ItemIcon className="size-5 shrink-0" weight={active ? 'fill' : 'bold'} aria-hidden="true" />
                      {hasPendingTickets && (
                        <span
                          className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-status-danger ring-2 ring-fb-surface"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {expanded && <span className="truncate">{item.label}</span>}
                    {expanded && hasPendingTickets && (
                      <span className="ml-auto size-2 shrink-0 rounded-full bg-status-danger" aria-hidden="true" />
                    )}
                    {expanded && item.disabled && <span className="ml-auto text-[8px] font-medium">Sắp có</span>}
                    {hasPendingTickets && <span className="sr-only"> (có ticket đang chờ xử lý)</span>}
                  </>
                );
                const { modal } = item;

                return (
                  <li key={item.label}>
                    <Tooltip content={item.label} disabled={expanded}>
                      {modal ? (
                        <button
                          type="button"
                          className={sharedClassName}
                          aria-label={!expanded ? item.label : undefined}
                          onClick={() => {
                            trackFeatureUsage();
                            onOpenModal(modal);
                            onNavigate?.();
                          }}
                        >
                          {content}
                        </button>
                      ) : item.disabled || !item.href ? (
                        <button
                          type="button"
                          disabled={item.disabled}
                          className={sharedClassName}
                          aria-label={!expanded ? item.label : undefined}
                        >
                          {content}
                        </button>
                      ) : (
                        <Link
                          href={item.href}
                          onClick={() => { trackFeatureUsage(); onNavigate?.(); }}
                          className={sharedClassName}
                          aria-current={active ? 'page' : undefined}
                          aria-label={!expanded ? item.label : undefined}
                        >
                          {content}
                        </Link>
                      )}
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-fb-border p-2">
        <UserMenu expanded={expanded} hiddenFeatureKeys={hiddenFeatureKeys} />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              'mt-1 flex min-h-9 w-full items-center rounded-md text-sidebar-text outline-none transition-colors hover:bg-fb-control hover:text-fb-text-primary',
              expanded ? 'gap-3 px-3' : 'justify-center px-2',
            )}
            aria-label={expanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
            title={expanded ? 'Thu gọn' : 'Mở rộng'}
            aria-expanded={expanded}
          >
            {expanded
              ? <CaretDoubleLeft className="size-5 shrink-0" weight="bold" aria-hidden="true" />
              : <CaretDoubleRight className="size-5 shrink-0" weight="bold" aria-hidden="true" />}
          </button>
        )}
      </div>
    </>
  );
}

// PAGE_HEADERS now lives in '@/lib/app-screens' (a dependency-free leaf module) so InfoBannersPanel
// can import it too without creating AppShell → GeneralSettingsModal → InfoBannersPanel → AppShell,
// a circular import that throws "Cannot access 'PAGE_HEADERS' before initialization" — importing it
// back out of this file was the original approach and is exactly what caused that.

// Mirrors the API-side role checks (epic-alerts, users, domains, projects, status-alert-rules,
// database, holidays/issue-type-roles routes) — a safe landing spot when a role that lacks access
// hits one of these URLs directly (nav already hides the link, but a direct URL still needs a
// redirect instead of a page full of 403s).
const PAGE_ROLES: Record<string, UserRole[]> = {
  '/': SUPERADMIN_ONLY,
  '/admin/database': SUPERADMIN_ONLY,
  '/admin/domains': ADMIN_VIEW_ROLES,
  '/admin/permissions': SUPERADMIN_ONLY,
  '/admin/projects': ADMIN_VIEW_ROLES,
  '/admin/status-alert-rules': SUPERADMIN_OR_SUPERVISOR,
  '/admin/users': ADMIN_VIEW_ROLES,
  '/dashboard-new': SUPERADMIN_ONLY,
  '/epic-alerts': ADMIN_VIEW_ROLES,
  // /data-review/[batchId] drills into "Nguồn dữ liệu" — same SUPERADMIN-only gate as its API.
  '/data-review': SUPERADMIN_ONLY,
};

function requiredRolesFor(pathname: string): UserRole[] | undefined {
  if (PAGE_ROLES[pathname]) return PAGE_ROLES[pathname];
  const prefixMatch = Object.keys(PAGE_ROLES).find((path) => path !== '/' && pathname.startsWith(`${path}/`));
  return prefixMatch ? PAGE_ROLES[prefixMatch] : undefined;
}

// Catches the case where a nav item is given `roles` but its route has no matching PAGE_ROLES
// entry: the link would be hidden correctly, but a direct URL visit wouldn't get redirected.
if (process.env.NODE_ENV !== 'production') {
  for (const section of navigation) {
    for (const item of section.items.flatMap((entry) => (isNavigationGroup(entry) ? entry.items : [entry]))) {
      if (item.roles && item.href && !requiredRolesFor(item.href)) {
        console.warn(`[AppShell] "${item.label}" (${item.href}) declares roles but has no PAGE_ROLES entry — direct navigation to it won't be redirect-protected.`);
      }
    }
  }
}

// Where a denied page sends the user: TTM Dashboard 2 (the landing page after sign-in) unless the
// permission matrix took its "Xem" away too — then the next page the role may still view
// (fallbackPathFor, feature-access.ts — same rule as src/proxy.ts).

// Session-only cache of the last known role, keyed per tab. Lets a repeat page load in the same
// tab restore the nav instantly instead of flashing the "no role" (fully collapsed) menu while
// /api/auth/me is in flight.
const ROLE_CACHE_KEY = 'ttm-role-cache';

function readCachedRole(): UserRole | null {
  const cached = window.sessionStorage.getItem(ROLE_CACHE_KEY);
  return cached && (USER_ROLES as readonly string[]).includes(cached) ? (cached as UserRole) : null;
}

// sessionStorage isn't reactive, but useSyncExternalStore is still the right tool here: it lets
// the cached role be read synchronously during render (no setState-in-effect cascade) while
// still returning `null` on the server snapshot, so hydration always matches the initial markup.
function subscribeToRoleCache(): () => void {
  return () => undefined;
}

function AppShellInner({ children }: AppShellProps) {
  const { items: epicHeaderWidgetItems } = useEpicHeaderWidgets();
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = React.useState(false);
  const [appConfigOpen, setAppConfigOpen] = React.useState(false);
  const [systemAdminOpen, setSystemAdminOpen] = React.useState(false);
  const [blackListedEpicsOpen, setBlackListedEpicsOpen] = React.useState(false);
  const openNavigationModal = React.useCallback((modal: NavigationModal) => {
    if (modal === 'appConfig') setAppConfigOpen(true);
    else if (modal === 'systemAdmin') setSystemAdminOpen(true);
    else setBlackListedEpicsOpen(true);
  }, []);
  const [mustChangePassword, setMustChangePassword] = React.useState(false);
  const [role, setRole] = React.useState<UserRole | null>(null);
  const [pendingUserTicketsCount, setPendingUserTicketsCount] = React.useState(0);
  const [hiddenFeatureKeys, setHiddenFeatureKeys] = React.useState<ReadonlySet<string>>(NO_HIDDEN_FEATURES);
  // Bumped when Ma trận phân quyền is saved in this tab, so the menu follows the new ticks at once
  // (other sessions pick the change up on their next navigation, via the same /api/auth/me call).
  const [permissionMatrixRevision, setPermissionMatrixRevision] = React.useState(0);
  // Best-effort last-known role for this tab, used only to avoid flashing the "no role" nav —
  // never to decide `isAuthorized` below, so a stale/downgraded cache can't skip the real gate.
  const cachedRole = React.useSyncExternalStore(subscribeToRoleCache, readCachedRole, () => null);
  const searchParams = useSearchParams();
  const isEmbedded = searchParams?.get('embedded') === 'true' || searchParams?.get('embedded') === '1';
  const displayRole = role ?? cachedRole;
  const pathname = usePathname();
  const router = useRouter();
  const header = PAGE_HEADERS[pathname] ?? PAGE_HEADERS['/'];
  const requiredRoles = requiredRolesFor(pathname);
  // Gates `children` below, not just the redirect: a protected page's own effects (data fetches,
  // etc.) must not mount for a role that doesn't belong there, even for the one tick before
  // router.replace takes effect. Deliberately uses the confirmed `role`, not `displayRole`.
  // Ma trận phân quyền: "Xem" unticked for this page's feature blocks the page too (2026-10-05). The
  // proxy already refuses a direct request; this covers the current tab right after the matrix is
  // saved (hiddenFeatureKeys refreshes via PERMISSION_MATRIX_CHANGED_EVENT / the next navigation).
  const currentFeatureKey = pageFeatureKey(pathname);
  const featureDenied = Boolean(currentFeatureKey && hiddenFeatureKeys.has(currentFeatureKey));
  const isAuthorized = !featureDenied && (!requiredRoles || (role !== null && requiredRoles.includes(role)));

  React.useEffect(() => {
    if (pathname === '/login') return;
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { hiddenFeatureKeys?: string[]; user?: { mustChangePassword?: boolean; role: UserRole } } | null) => {
        if (cancelled || !data?.user) return;
        setRole(data.user.role);
        setHiddenFeatureKeys(new Set(data.hiddenFeatureKeys ?? []));
        window.sessionStorage.setItem(ROLE_CACHE_KEY, data.user.role);
        // Unconditional sync (not just "set true"): AppShell is a shared layout that survives a
        // client-side logout→/login→login-again round trip without unmounting, so a `true` from an
        // earlier session (forced first-time change) would otherwise never get cleared back to
        // `false` once the DB flag is actually cleared — reproducing exactly the reported bug (only
        // a full reload, which remounts AppShell from its `false` default, "fixed" it).
        setMustChangePassword(Boolean(data.user.mustChangePassword));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname, permissionMatrixRevision]);

  React.useEffect(() => {
    const refresh = () => setPermissionMatrixRevision((current) => current + 1);
    window.addEventListener(PERMISSION_MATRIX_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PERMISSION_MATRIX_CHANGED_EVENT, refresh);
  }, []);

  React.useEffect(() => {
    if (!role) return;
    if (featureDenied || (requiredRoles && !requiredRoles.includes(role))) router.replace(fallbackPathFor(hiddenFeatureKeys, pathname));
  }, [featureDenied, hiddenFeatureKeys, pathname, role, requiredRoles, router]);

  // Landed here because the proxy refused a page (?denied=<featureKey>): say why once, then drop the
  // parameter so a reload doesn't repeat it.
  const deniedFeature = searchParams?.get('denied');
  React.useEffect(() => {
    if (!deniedFeature) return;
    showToast('Bạn không có quyền xem chức năng vừa mở (Ma trận phân quyền) — đã chuyển về màn hình được phép.', 6000);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.delete('denied');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [deniedFeature, pathname, router, searchParams]);

  // Red dot on "Quản lý User" — polled (not just fetched once) so an admin sitting on another page
  // notices a new self-lockout ticket (5 failed logins, see auth-service.ts) without reloading.
  React.useEffect(() => {
    if (!role || !ADMIN_VIEW_ROLES.includes(role)) {
      void Promise.resolve().then(() => setPendingUserTicketsCount(0));
      return undefined;
    }
    let cancelled = false;
    const load = () => fetch('/api/admin/pending-tickets-count', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: number } | null) => { if (!cancelled && data) setPendingUserTicketsCount(data.total ?? 0); })
      .catch(() => undefined);
    void load();
    const intervalId = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [role]);

  React.useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileNavigationOpen]);

  React.useEffect(() => {
    if (!role || mustChangePassword) return;
    const screenKey = resolveScreenKeyFromPathname(pathname);
    if (screenKey) {
      trackScreenVisit(screenKey);
    }
  }, [pathname, role, mustChangePassword]);

  if (pathname === '/login') return <>{children}</>;

  if (isEmbedded) {
    return (
      <div className="app-type-unified min-h-screen bg-fb-bg text-fb-text-primary">
        <main className="w-full min-h-screen p-2 sm:p-4">
          {mustChangePassword ? (
            <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
              <p className="text-base font-bold text-fb-text-primary">Yêu cầu đổi mật khẩu lần đầu</p>
              <p className="mt-2 text-sm text-fb-text-secondary">
                Tài khoản của bạn cần đổi mật khẩu lần đầu để đảm bảo bảo mật trước khi tiếp tục sử dụng hệ thống.
              </p>
            </div>
          ) : isAuthorized ? children : (
            <div className="flex flex-1 items-center justify-center py-24 text-sm text-fb-text-secondary">
              Đang kiểm tra quyền truy cập…
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app-type-unified min-h-[100dvh] bg-fb-bg text-fb-text-primary">
      <aside
        className={cn(
          'sidebar-surface fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-fb-border transition-[width] duration-150 lg:flex',
          desktopNavigationExpanded ? 'w-64' : 'w-[72px]',
        )}
      >
        <SidebarContent
          expanded={desktopNavigationExpanded}
          onOpenModal={openNavigationModal}
          onToggle={() => setDesktopNavigationExpanded((current) => !current)}
          pendingUserTicketsCount={pendingUserTicketsCount}
          role={displayRole}
          hiddenFeatureKeys={hiddenFeatureKeys}
        />
      </aside>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavigationOpen(false)}
            aria-label="Đóng điều hướng"
          />
          <aside className="sidebar-surface relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-fb-border shadow-dialog">
            <button
              type="button"
              onClick={() => setMobileNavigationOpen(false)}
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-md text-sidebar-text hover:bg-fb-control hover:text-fb-text-primary"
              aria-label="Đóng menu"
            >
              <X className="size-5" weight="bold" aria-hidden="true" />
            </button>
            <SidebarContent
              expanded
              onNavigate={() => setMobileNavigationOpen(false)}
              onOpenModal={openNavigationModal}
              pendingUserTicketsCount={pendingUserTicketsCount}
              role={displayRole}
              hiddenFeatureKeys={hiddenFeatureKeys}
            />
          </aside>
        </div>
      )}

      <AppConfigModal isOpen={appConfigOpen} onClose={() => setAppConfigOpen(false)} role={role} />
      <SystemAdminModal isOpen={systemAdminOpen} onClose={() => setSystemAdminOpen(false)} role={role} />
      <BlackListedEpicsModal isOpen={blackListedEpicsOpen} onClose={() => setBlackListedEpicsOpen(false)} />
      <AdPopupDisplay />
      <ChangePasswordModal isForceChangePassword isOpen={mustChangePassword} onClose={() => {}} />
      {/* Only in the full shell (never the embedded/iframe branch above), so a dashboard drill-down
          popup doesn't run a second trigger/poll alongside its parent page. */}
      <DailyCacheWarmer enabled={role !== null && !mustChangePassword} />

      <div className={cn('min-w-0', desktopNavigationExpanded ? 'lg:pl-64' : 'lg:pl-[72px]')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-fb-border ttm-frosted-header px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavigationOpen(true)}
            className="grid size-10 place-items-center rounded-md text-fb-text-secondary hover:bg-fb-control lg:hidden"
            aria-label="Mở điều hướng"
          >
            <List className="size-5" weight="bold" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-[-0.025em]">{header.title}</h1>
            <p className="hidden text-sm text-fb-text-secondary sm:block">{header.subtitle}</p>
          </div>
          {pathname === '/' && (
            <div className="ml-auto hidden rounded-md border border-fb-border bg-fb-surface-muted px-3 py-1.5 text-xs font-semibold text-fb-text-secondary sm:block">
              CSV Adapter đang hoạt động
            </div>
          )}
          {pathname === '/epic-alerts-15' && epicHeaderWidgetItems && (
            <div className="ml-auto hidden shrink-0 items-center gap-1.5 lg:flex">
              {epicHeaderWidgetItems.map((item) => (
                <Tooltip key={item.key} multiline side="bottom" align="end" content={item.tooltip} className="inline-flex w-auto">
                  <div className="flex flex-col items-end gap-0 rounded-md border border-fb-border bg-fb-surface-muted px-2 py-1 leading-none cursor-help hover:bg-fb-control transition-colors">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-fb-text-secondary">{item.label}</span>
                    <span className={cn('text-sm font-extrabold', item.tone === 'qa' ? 'text-purple-700' : item.tone === 'e2e' ? 'text-emerald-700' : 'text-fb-blue')}>{item.value}</span>
                  </div>
                </Tooltip>
              ))}
            </div>
          )}
        </header>

        {/* Quản trị Epic's 13-column table is 10% wider than the other screens' content (2026-10-06). */}
        <main className={cn('mx-auto flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8', pathname === '/epic-alerts-15' ? 'max-w-[1760px]' : 'max-w-[1600px]')}>
          {mustChangePassword ? (
            <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
              <p className="text-base font-bold text-fb-text-primary">Yêu cầu đổi mật khẩu lần đầu</p>
              <p className="mt-2 text-sm text-fb-text-secondary">
                Tài khoản của bạn cần đổi mật khẩu lần đầu để đảm bảo bảo mật trước khi tiếp tục sử dụng hệ thống.
              </p>
            </div>
          ) : isAuthorized ? children : (
            <div className="flex flex-1 items-center justify-center py-24 text-sm text-fb-text-secondary">
              Đang kiểm tra quyền truy cập…
            </div>
          )}
        </main>
      </div>

      <SystemStatusFooter />
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <EpicHeaderWidgetsProvider>
      <ToastProvider>
        <React.Suspense fallback={<div className="min-h-screen bg-fb-bg" />}>
          <AppShellInner>{children}</AppShellInner>
        </React.Suspense>
      </ToastProvider>
    </EpicHeaderWidgetsProvider>
  );
}
