'use client';

import * as React from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

export interface PickableUser {
  email: string;
  fullName: string;
  id: number;
  role: string;
}

interface UserPickerModalProps<T extends PickableUser> {
  emptyText?: string;
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: T) => void;
  title: string;
  users: readonly T[];
}

/** "Chọn User…" popup: search by name / email / role, click a row to pick. Shared by "Xem trước Dashboard" and "Xem với User khác". */
export function UserPickerModal<T extends PickableUser>({ emptyText = 'Không có user phù hợp.', isLoading = false, isOpen, onClose, onSelect, title, users }: UserPickerModalProps<T>) {
  const [searchText, setSearchText] = React.useState('');
  const filtered = React.useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query) || user.role.toLowerCase().includes(query));
  }, [searchText, users]);

  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 p-4">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-2.5 size-4 text-fb-text-placeholder" />
          <input
            type="text"
            placeholder="Tìm theo tên, email, role…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="w-full rounded-lg border border-fb-border py-2 pl-9 pr-4 text-xs outline-none focus:border-[var(--color-text-brand)]"
          />
        </div>
        <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
          {isLoading && <p className="p-2 text-xs text-fb-text-secondary">Đang tải…</p>}
          {!isLoading && filtered.length === 0 && <p className="p-2 text-xs text-fb-text-secondary">{emptyText}</p>}
          {filtered.map((user) => (
            <button
              type="button"
              key={user.id}
              onClick={() => onSelect(user)}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-fb-border p-2.5 text-left text-xs transition-colors hover:bg-fb-surface-muted"
            >
              <div>
                <div className="font-bold text-fb-text-primary">{user.fullName}</div>
                <div className="text-[11px] text-fb-text-placeholder">{user.email}</div>
              </div>
              <Badge variant="neutral" className="font-mono text-[11px]">{user.role}</Badge>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
