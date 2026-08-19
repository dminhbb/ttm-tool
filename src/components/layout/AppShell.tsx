'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { USER_ROLES, type UserRole } from '@/lib/auth-types';
import {
  Archive,
  CaretDoubleLeft,
  CaretDoubleRight,
  Database,
  Folder,
  Gauge,
  GearSix,
  Globe,
  List,
  Lock,
  Pulse,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { UserMenu } from '@/components/layout/UserMenu';
import { GeneralSettingsModal } from '@/components/settings/GeneralSettingsModal';
import { SystemStatusFooter } from '@/components/layout/SystemStatusFooter';

interface NavigationItem {
  disabled?: boolean;
  href?: string;
  icon: Icon;
  label: string;
  onClick?: () => void;
  /** Omitted = every authenticated role. Matches the permission matrix (see AGENTS.md-adjacent docs). */
  roles?: UserRole[];
}

interface NavigationSection {
  items: NavigationItem[];
  label: string;
}

interface SidebarContentProps {
  expanded: boolean;
  onNavigate?: () => void;
  onOpenSettings: () => void;
  onToggle?: () => void;
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

const GENERAL_SETTINGS_ITEM: NavigationItem = { icon: GearSix, label: 'Quản lý chung', roles: ADMIN_VIEW_ROLES };

const navigation: NavigationSection[] = [
  {
    label: 'Giám sát',
    items: [
      { icon: Gauge, label: 'Dashboard', disabled: true },
      { href: '/epic-alerts', icon: Warning, label: 'Quản lý Epic 30', roles: ADMIN_VIEW_ROLES },
      { href: '/epic-alerts-15', icon: Warning, label: 'Quản trị Epic' },
    ],
  },
  {
    label: 'Quản trị hệ thống',
    items: [
      { href: '/', icon: Database, label: 'Nguồn dữ liệu', roles: SUPERADMIN_ONLY },
      { href: '/admin/users', icon: Users, label: 'Quản lý User', roles: ADMIN_VIEW_ROLES },
      { href: '/admin/domains', icon: Globe, label: 'Quản lý Domain', roles: ADMIN_VIEW_ROLES },
      { href: '/admin/projects', icon: Folder, label: 'Quản lý Dự án', roles: ADMIN_VIEW_ROLES },
      { href: '/admin/status-alert-rules', icon: Warning, label: 'Cấu hình cảnh báo', roles: SUPERADMIN_OR_SUPERVISOR },
      { href: '/admin/database', icon: Archive, label: 'Sao lưu / Phục hồi dữ liệu', roles: SUPERADMIN_ONLY },
      { href: '/admin/permissions', icon: Lock, label: 'Ma trận phân quyền', roles: SUPERADMIN_ONLY },
      GENERAL_SETTINGS_ITEM,
    ],
  },
];

/** Every "Quản trị hệ thống" item needs at least ADMIN, so a plain USER always ends up with an
 * empty section — dropped entirely rather than shown as a header with nothing under it. */
function visibleNavigationFor(role: UserRole | null): NavigationSection[] {
  return navigation
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.roles || (role !== null && item.roles.includes(role))) }))
    .filter((section) => section.items.length > 0);
}

function SidebarContent({ expanded, onNavigate, onOpenSettings, onToggle, role }: SidebarContentProps) {
  const pathname = usePathname();
  const sections = visibleNavigationFor(role);

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
                const ItemIcon = item.icon;
                const active = !!item.href && pathname === item.href;
                const sharedClassName = cn(
                  'flex min-h-10 w-full items-center rounded-md text-left text-sm font-semibold outline-none transition-[background-color,color]',
                  expanded ? 'gap-3 px-3' : 'justify-center px-2',
                  active && 'bg-fb-blue-soft text-fb-blue',
                  !active && !item.disabled && 'text-sidebar-text hover:bg-fb-control hover:text-fb-text-primary',
                  item.disabled && 'cursor-not-allowed text-sidebar-disabled',
                );
                const content = (
                  <>
                    <ItemIcon className="size-5 shrink-0" weight={active ? 'fill' : 'bold'} aria-hidden="true" />
                    {expanded && <span className="truncate">{item.label}</span>}
                    {expanded && item.disabled && <span className="ml-auto text-[8px] font-medium">Sắp có</span>}
                  </>
                );
                const isGeneralSettings = item === GENERAL_SETTINGS_ITEM;
                return (
                  <li key={item.label}>
                    <Tooltip content={item.label} disabled={expanded}>
                      {isGeneralSettings ? (
                        <button
                          type="button"
                          className={sharedClassName}
                          aria-label={!expanded ? item.label : undefined}
                          onClick={() => {
                            onOpenSettings();
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
                          onClick={onNavigate}
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
        <UserMenu expanded={expanded} />
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

const PAGE_HEADERS: Record<string, { subtitle: string; title: string }> = {
  '/': { subtitle: 'Kiểm tra và quản lý các lớp dữ liệu Jira nhập vào TTM Monitor', title: 'Quản trị nguồn dữ liệu' },
  '/epic-alerts': { subtitle: 'Cảnh báo TTM-CNTT dựa trên đợt import dữ liệu mới nhất', title: 'Quản lý Epic 30' },
  '/epic-alerts-15': { subtitle: 'Cảnh báo TTM-CNTT theo giai đoạn DESIGN/DEV/TEST/PENTEST/R4GOLIVE', title: 'Quản trị Epic' },
  '/admin/domains': { subtitle: 'Quản lý danh mục Domain nghiệp vụ', title: 'Quản lý Domain' },
  '/admin/projects': { subtitle: 'Quản lý danh mục Dự án và mapping với Domain', title: 'Quản lý Dự án' },
  '/admin/holidays': { subtitle: 'Cấu hình ngày nghỉ dùng để tính ngày làm việc', title: 'Cấu hình ngày nghỉ' },
  '/admin/status-alert-rules': { subtitle: 'Thiết lập mốc cảnh báo TTM-CNTT theo loại và trạng thái Epic', title: 'Cấu hình cảnh báo' },
  '/admin/users': { subtitle: 'Quản lý tài khoản, role và trạng thái người dùng', title: 'Quản lý User' },
  '/admin/database': { subtitle: 'Export/Import dữ liệu ứng dụng dưới dạng file SQL', title: 'Sao lưu / Phục hồi dữ liệu' },
  '/admin/permissions': { subtitle: 'Cấu hình quyền Xem/Thêm/Sửa/Xóa theo vai trò cho từng chức năng', title: 'Ma trận phân quyền' },
  '/docs/product': { subtitle: 'Tài liệu trình bày và đào tạo về hệ thống TTM Monitor', title: 'Tài liệu sản phẩm' },
};

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
    for (const item of section.items) {
      if (item.roles && item.href && !requiredRolesFor(item.href)) {
        console.warn(`[AppShell] "${item.label}" (${item.href}) declares roles but has no PAGE_ROLES entry — direct navigation to it won't be redirect-protected.`);
      }
    }
  }
}

// Every role can reach Epic 15, so it's the safe fallback landing page when access is denied.
const FALLBACK_PATH = '/epic-alerts-15';

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

export function AppShell({ children }: AppShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = React.useState(false);
  const [generalSettingsOpen, setGeneralSettingsOpen] = React.useState(false);
  const [role, setRole] = React.useState<UserRole | null>(null);
  // Best-effort last-known role for this tab, used only to avoid flashing the "no role" nav —
  // never to decide `isAuthorized` below, so a stale/downgraded cache can't skip the real gate.
  const cachedRole = React.useSyncExternalStore(subscribeToRoleCache, readCachedRole, () => null);
  const displayRole = role ?? cachedRole;
  const pathname = usePathname();
  const router = useRouter();
  const header = PAGE_HEADERS[pathname] ?? PAGE_HEADERS['/'];
  const requiredRoles = requiredRolesFor(pathname);
  // Gates `children` below, not just the redirect: a protected page's own effects (data fetches,
  // etc.) must not mount for a role that doesn't belong there, even for the one tick before
  // router.replace takes effect. Deliberately uses the confirmed `role`, not `displayRole`.
  const isAuthorized = !requiredRoles || (role !== null && requiredRoles.includes(role));

  React.useEffect(() => {
    if (pathname === '/login') return;
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: { role: UserRole } } | null) => {
        if (cancelled || !data?.user) return;
        setRole(data.user.role);
        window.sessionStorage.setItem(ROLE_CACHE_KEY, data.user.role);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [pathname]);

  React.useEffect(() => {
    if (!role || !requiredRoles) return;
    if (!requiredRoles.includes(role)) router.replace(FALLBACK_PATH);
  }, [pathname, role, requiredRoles, router]);

  React.useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileNavigationOpen]);

  if (pathname === '/login') return <>{children}</>;

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
          onOpenSettings={() => setGeneralSettingsOpen(true)}
          onToggle={() => setDesktopNavigationExpanded((current) => !current)}
          role={displayRole}
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
              onOpenSettings={() => setGeneralSettingsOpen(true)}
              role={displayRole}
            />
          </aside>
        </div>
      )}

      <GeneralSettingsModal isOpen={generalSettingsOpen} onClose={() => setGeneralSettingsOpen(false)} />

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
        </header>

        <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {isAuthorized ? children : (
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
