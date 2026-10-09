'use client';

import * as React from 'react';
import { Calendar, SlidersHorizontal, Tag } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { MODAL_BACKDROP_CLASS, MODAL_FRAME_CLASS, ModalHeader, useModalBehavior } from '@/components/ui/Modal';
import type { UserRole } from '@/lib/auth-types';
import { HolidaysAndWorkdaysSection } from '@/components/settings/HolidaysAndWorkdaysSection';
import { IssueTypeRolesPanel } from '@/components/settings/IssueTypeRolesPanel';

export interface AppConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  role?: UserRole | null;
}

interface SettingsSection {
  icon: Icon;
  id: string;
  label: string;
  panel: React.ReactNode;
}

const CONFIG_SECTIONS: SettingsSection[] = [
  { id: 'holidays', icon: Calendar, label: 'Quản lý ngày nghỉ/làm bù', panel: <HolidaysAndWorkdaysSection /> },
  { id: 'issue-type-roles', icon: Tag, label: 'Quản lý Issue Type', panel: <IssueTypeRolesPanel /> },
];

export function AppConfigModal({ isOpen, onClose }: AppConfigModalProps) {
  const [activeSectionId, setActiveSectionId] = React.useState(CONFIG_SECTIONS[0].id);
  const titleId = React.useId();
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  useModalBehavior(isOpen, onClose, closeButtonRef);

  if (!isOpen) return null;

  const activeSection = CONFIG_SECTIONS.find((section) => section.id === activeSectionId) ?? CONFIG_SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className={MODAL_BACKDROP_CLASS} onClick={onClose} aria-hidden="true" />

      <div
        className={cn(MODAL_FRAME_CLASS, 'h-[85dvh] w-full max-w-[1280px] overflow-hidden')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <ModalHeader closeButtonRef={closeButtonRef} icon={SlidersHorizontal} onClose={onClose} title="Cấu hình ứng dụng" titleId={titleId} />

        <div className="flex min-h-0 flex-1">
          <nav
            className="flex w-[30%] shrink-0 flex-col gap-1 overflow-y-auto border-r border-fb-border bg-fb-surface-muted p-3"
            aria-label="Chức năng cấu hình ứng dụng"
          >
            {CONFIG_SECTIONS.map((section) => {
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

export { AppConfigModal as GeneralSettingsModal };
