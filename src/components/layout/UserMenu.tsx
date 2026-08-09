'use client';

import * as React from 'react';
import { GearSix, Moon, Sun, UserCircle } from '@phosphor-icons/react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

type AppearanceTheme = 'dark' | 'light';

const APPEARANCE_STORAGE_KEY = 'ttm-monitor.appearance-theme';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light mode' },
  { value: 'dark', label: 'Dark mode' },
];

interface UserMenuProps {
  expanded: boolean;
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
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [hasLoadedPreference, setHasLoadedPreference] = React.useState(false);
  const [theme, setTheme] = React.useState<AppearanceTheme>('light');

  React.useEffect(() => {
    void Promise.resolve().then(() => {
      setTheme(loadStoredTheme());
      setHasLoadedPreference(true);
    });
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

  const icon = theme === 'dark'
    ? <Moon className="size-4" weight="bold" aria-hidden="true" />
    : <Sun className="size-4" weight="bold" aria-hidden="true" />;

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
        <span className="ui-avatar">A</span>
        {expanded && (
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-fb-text-primary">Administrator</span>
            <span className="mt-0.5 flex items-center gap-1 truncate text-[9px] font-medium text-sidebar-muted">{icon} CBQL Phòng</span>
          </span>
        )}
      </button>

      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Cài đặt"
        footer={<Button variant="outline" onClick={() => setIsSettingsOpen(false)}>Đóng</Button>}
      >
        <div className="ui-form">
          <section className="ui-form-section" aria-labelledby="appearance-settings-title">
            <div>
              <h3 id="appearance-settings-title" className="ui-card-title">Giao diện</h3>
              <p className="mt-1 text-xs text-fb-text-secondary">Lựa chọn được lưu trên thiết bị này và áp dụng lại khi bạn mở ứng dụng.</p>
            </div>
            <Select
              label="Chế độ hiển thị"
              value={theme}
              onChange={(event) => setTheme(event.target.value as AppearanceTheme)}
              options={THEME_OPTIONS}
            />
          </section>
        </div>
      </Modal>
    </div>
  );
}
