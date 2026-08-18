'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, FlowArrow, GearSix, SignOut, UserCircle, Warning } from '@phosphor-icons/react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { AlertLogicModal, DataLogicModal } from '@/components/layout/HelpPanels';
import { AppearancePanel } from '@/components/settings/AppearancePanel';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/lib/auth-types';

type AppearanceTheme = 'dark' | 'light';

const APPEARANCE_STORAGE_KEY = 'ttm-monitor.appearance-theme';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light mode' },
  { value: 'dark', label: 'Dark mode' },
];

interface UserMenuProps {
  expanded: boolean;
}

interface CurrentUser {
  email: string;
  fullName: string;
  role: UserRole;
}

function loadStoredTheme(): AppearanceTheme {
  try {
    return window.localStorage.getItem(APPEARANCE_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch (error) {
    console.warn('Unable to load the saved appearance preference.', error);
    return 'light';
  }
}

export function UserMenu({ expanded }: UserMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isAlertLogicOpen, setIsAlertLogicOpen] = React.useState(false);
  const [isDataLogicOpen, setIsDataLogicOpen] = React.useState(false);
  const [hasLoadedPreference, setHasLoadedPreference] = React.useState(false);
  const [theme, setTheme] = React.useState<AppearanceTheme>('light');
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  React.useEffect(() => {
    void Promise.resolve().then(() => {
      setTheme(loadStoredTheme());
      setHasLoadedPreference(true);
    });
  }, []);

  React.useEffect(() => {
    const loadUser = async (): Promise<void> => {
      try {
        const response = await fetch('/api/auth/me');
        const payload: unknown = await response.json();
        if (response.ok && typeof payload === 'object' && payload !== null && 'user' in payload && typeof payload.user === 'object' && payload.user !== null && 'email' in payload.user && 'fullName' in payload.user && 'role' in payload.user && typeof payload.user.email === 'string' && typeof payload.user.fullName === 'string' && typeof payload.user.role === 'string') {
          setUser({ email: payload.user.email, fullName: payload.user.fullName, role: payload.user.role as UserRole });
        }
      } catch (error) {
        console.warn('Unable to load the signed-in user profile.', error);
      }
    };
    void loadUser();
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!hasLoadedPreference) return;
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, theme);
    } catch (error) {
      console.warn('Unable to save the appearance preference.', error);
    }
  }, [hasLoadedPreference, theme]);

  React.useEffect(() => {
    if (!isMenuOpen) return undefined;
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const logout = async (): Promise<void> => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); }
    finally { router.replace('/login'); router.refresh(); }
  };

  return (
    <div ref={menuRef} className="relative">
      {isMenuOpen && (
        <div
          className={cn(
            'absolute bottom-full z-50 mb-2 min-w-56 rounded-lg border border-fb-border bg-fb-surface p-1 shadow-dialog',
            expanded ? 'left-0' : 'left-0',
          )}
          role="menu"
          aria-label="Menu người dùng"
        >
          <button type="button" disabled className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-fb-text-placeholder disabled:cursor-not-allowed" role="menuitem">
            <UserCircle className="size-4 shrink-0" weight="bold" aria-hidden="true" />
            <span>Thông tin cá nhân</span>
            <span className="ml-auto text-xs">Sắp có</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsMenuOpen(false); setIsSettingsOpen(true); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-fb-text-primary transition-colors hover:bg-fb-control"
            role="menuitem"
          >
            <GearSix className="size-4 shrink-0" weight="bold" aria-hidden="true" />
            <span>Cài đặt</span>
          </button>
          <button
            type="button"
            onClick={() => { setIsMenuOpen(false); setIsAlertLogicOpen(true); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-fb-text-primary transition-colors hover:bg-fb-control"
            role="menuitem"
          >
            <Warning className="size-4 shrink-0" weight="bold" aria-hidden="true" />
            <span>Logic cảnh báo</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setIsMenuOpen(false); setIsDataLogicOpen(true); }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-fb-text-primary transition-colors hover:bg-fb-control"
              role="menuitem"
            >
              <FlowArrow className="size-4 shrink-0" weight="bold" aria-hidden="true" />
              <span>Logic xử lý dữ liệu</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setIsMenuOpen(false); router.push('/docs/product'); }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-fb-text-primary transition-colors hover:bg-fb-control"
            role="menuitem"
          >
            <BookOpen className="size-4 shrink-0" weight="bold" aria-hidden="true" />
            <span>Tài liệu sản phẩm</span>
          </button>
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-status-danger transition-colors hover:bg-fb-control" role="menuitem">
            <SignOut className="size-4 shrink-0" weight="bold" aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsMenuOpen((current) => !current)}
        className={cn('flex w-full items-center rounded-md py-2 text-left outline-none hover:bg-fb-control', expanded ? 'gap-3 px-2' : 'justify-center px-1')}
        aria-label="Mở menu người dùng"
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
      >
        <span className="ui-avatar">{(user?.fullName || user?.email || 'U').trim().charAt(0).toUpperCase()}</span>
        {expanded && (
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-fb-text-primary">{user?.fullName || 'Đang tải...'}</span>
            <span className="mt-0.5 block truncate text-[9px] font-medium text-sidebar-muted">{user?.email || ''}</span>
          </span>
        )}
      </button>

      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Cài đặt"
        footer={<Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Đóng</Button>}
      >
        <div className="ui-form flex flex-col gap-6">
          <section className="ui-form-section flex flex-col gap-3" aria-label="Chế độ hiển thị">
            <Select
              label="Sáng / Tối"
              value={theme}
              onChange={(event) => setTheme(event.target.value as AppearanceTheme)}
              options={THEME_OPTIONS}
            />
          </section>

          <section className="ui-form-section flex flex-col gap-3" aria-labelledby="brand-settings-title">
            <div>
              <h3 id="brand-settings-title" className="ui-card-title">Giao diện</h3>
              <p className="mt-1 text-xs text-fb-text-secondary">Chọn phong cách hiển thị tổng thể của ứng dụng.</p>
            </div>
            <AppearancePanel />
          </section>
        </div>
      </Modal>

      <AlertLogicModal isOpen={isAlertLogicOpen} onClose={() => setIsAlertLogicOpen(false)} />
      {isAdmin && <DataLogicModal isOpen={isDataLogicOpen} onClose={() => setIsDataLogicOpen(false)} />}
    </div>
  );
}
