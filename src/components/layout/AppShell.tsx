'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  Calendar,
  CaretDoubleLeft,
  CaretDoubleRight,
  ChartBar,
  Database,
  Folder,
  Gauge,
  Globe,
  List,
  Pulse,
  Users,
  Warning,
  X,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { UserMenu } from '@/components/layout/UserMenu';

interface NavigationItem {
  disabled?: boolean;
  href?: string;
  icon: Icon;
  label: string;
}

interface NavigationSection {
  items: NavigationItem[];
  label: string;
}

interface SidebarContentProps {
  expanded: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
}

export interface AppShellProps {
  children: React.ReactNode;
}

const navigation: NavigationSection[] = [
  {
    label: 'Giám sát',
    items: [
      { icon: Gauge, label: 'Dashboard', disabled: true },
      { href: '/epic-monitoring', icon: ChartBar, label: 'Theo dõi Epic' },
      { href: '/epic-alerts', icon: Warning, label: 'Quản lý Epic của tôi' },
    ],
  },
  {
    label: 'Quản trị hệ thống',
    items: [
      { href: '/', icon: Database, label: 'Nguồn dữ liệu' },
      { href: '/admin/users', icon: Users, label: 'Quản lý User' },
      { href: '/admin/domains', icon: Globe, label: 'Quản lý Domain' },
      { href: '/admin/projects', icon: Folder, label: 'Quản lý Dự án' },
      { href: '/admin/holidays', icon: Calendar, label: 'Cấu hình ngày nghỉ' },
      { href: '/admin/status-alert-rules', icon: Warning, label: 'Cấu hình cảnh báo' },
      { href: '/admin/database', icon: Archive, label: 'Sao lưu / Phục hồi dữ liệu' },
    ],
  },
];

function SidebarContent({ expanded, onNavigate, onToggle }: SidebarContentProps) {
  const pathname = usePathname();

  return (
    <>
      <div className={cn('flex h-16 items-center border-b border-fb-border', expanded ? 'gap-3 px-4' : 'justify-center px-2')}>
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-fb-blue text-slate-950">
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
        {navigation.map((section) => (
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
                return (
                  <li key={item.label}>
                    <Tooltip content={item.label} disabled={expanded}>
                      {item.disabled || !item.href ? (
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
  '/epic-monitoring': { subtitle: 'Theo dõi rủi ro TTM-CNTT của các Epic theo thời gian thực', title: 'Theo dõi Epic' },
  '/epic-alerts': { subtitle: 'Thiết kế bảng cảnh báo Epic theo TTM Epic Management Design Package (bản so sánh)', title: 'Quản lý Epic của tôi' },
  '/admin/domains': { subtitle: 'Quản lý danh mục Domain nghiệp vụ', title: 'Quản lý Domain' },
  '/admin/projects': { subtitle: 'Quản lý danh mục Dự án và mapping với Domain', title: 'Quản lý Dự án' },
  '/admin/holidays': { subtitle: 'Cấu hình ngày nghỉ dùng để tính ngày làm việc', title: 'Cấu hình ngày nghỉ' },
  '/admin/status-alert-rules': { subtitle: 'Thiết lập mốc cảnh báo TTM-CNTT theo loại và trạng thái Epic', title: 'Cấu hình cảnh báo' },
  '/admin/users': { subtitle: 'Quản lý tài khoản, role và trạng thái người dùng', title: 'Quản lý User' },
  '/admin/database': { subtitle: 'Export/Import dữ liệu ứng dụng dưới dạng file SQL', title: 'Sao lưu / Phục hồi dữ liệu' },
};

export function AppShell({ children }: AppShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = React.useState(false);
  const pathname = usePathname();
  const header = PAGE_HEADERS[pathname] ?? PAGE_HEADERS['/'];

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
          onToggle={() => setDesktopNavigationExpanded((current) => !current)}
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
            <SidebarContent expanded onNavigate={() => setMobileNavigationOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn('min-w-0', desktopNavigationExpanded ? 'lg:pl-64' : 'lg:pl-[72px]')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-fb-border bg-fb-bg px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavigationOpen(true)}
            className="grid size-10 place-items-center rounded-md text-fb-text-secondary hover:bg-fb-control lg:hidden"
            aria-label="Mở điều hướng"
          >
            <List className="size-5" weight="bold" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-[-0.025em]">{header.title}</h1>
            <p className="hidden text-sm text-fb-text-secondary sm:block">{header.subtitle}</p>
          </div>
          {pathname === '/' && (
            <div className="ml-auto hidden rounded-md border border-fb-border bg-fb-surface-muted px-3 py-1.5 text-xs font-semibold text-fb-text-secondary sm:block">
              CSV Adapter đang hoạt động
            </div>
          )}
        </header>

        <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
