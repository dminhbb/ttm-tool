'use client';

import * as React from 'react';
import { Calendar, Tag, X } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { HolidaysPanel } from '@/components/settings/HolidaysPanel';
import { IssueTypeRolesPanel } from '@/components/settings/IssueTypeRolesPanel';

export interface GeneralSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SettingsSection {
  icon: Icon;
  id: string;
  label: string;
  panel: React.ReactNode;
}

const SECTIONS: SettingsSection[] = [
  { id: 'holidays', icon: Calendar, label: 'Quản lý ngày nghỉ', panel: <HolidaysPanel /> },
  { id: 'issue-type-roles', icon: Tag, label: 'Quản lý Issue Type', panel: <IssueTypeRolesPanel /> },
];

export function GeneralSettingsModal({ isOpen, onClose }: GeneralSettingsModalProps) {
  const [activeSectionId, setActiveSectionId] = React.useState(SECTIONS[0].id);
  const titleId = React.useId();
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEscape);
      window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const activeSection = SECTIONS.find((section) => section.id === activeSectionId) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/60 transition-opacity duration-200" onClick={onClose} aria-hidden="true" />

      <div
        className="relative z-10 flex h-[85dvh] w-full max-w-[1280px] flex-col overflow-hidden rounded-xl border border-fb-border bg-fb-surface text-fb-text-primary shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between border-b border-fb-border px-5 py-4 select-none">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-fb-text-primary">Quản lý chung</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-md text-fb-text-secondary outline-none transition-colors hover:bg-fb-control hover:text-fb-text-primary"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-4 h-4" weight="bold" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-[30%] shrink-0 flex-col gap-1 overflow-y-auto border-r border-fb-border bg-fb-surface-muted p-3"
            aria-label="Chức năng cấu hình chung"
          >
            {SECTIONS.map((section) => {
              const SectionIcon = section.icon;
              const active = section.id === activeSectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold outline-none transition-colors',
                    active
                      ? 'bg-fb-blue-soft text-fb-blue'
                      : 'text-fb-text-secondary hover:bg-fb-control hover:text-fb-text-primary',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <SectionIcon className="size-5 shrink-0" weight={active ? 'fill' : 'bold'} aria-hidden="true" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="w-[70%] flex-1 overflow-y-auto p-5">
            {activeSection.panel}
          </div>
        </div>
      </div>
    </div>
  );
}
