'use client';

import * as React from 'react';
import { Check, PencilSimple, Plus, Tag, Trash, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { alertDialog, confirmDialog } from '@/components/ui/dialogs';
import { NEWS_LETTER_CATEGORY_NAME_MAX, type NewsLetterCategory } from '@/lib/news-letter/types';

/**
 * "Quản trị Phân loại" of "Bản tin" (the "+" next to the Phân loại dropdown, SUPERADMIN): add, rename, delete. A category
 * still used by articles can't be deleted — the server answers how many use it.
 */

type CategoriesResponse = { categories?: NewsLetterCategory[]; error?: string };

async function send(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<NewsLetterCategory[]> {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await response.json().catch(() => ({}))) as CategoriesResponse;
  if (!response.ok || !data.categories) throw new Error(data.error || 'Không thể lưu phân loại.');
  return data.categories;
}

export function CategoryManagerModal({ categories, isOpen, onChange, onClose }: {
  categories: NewsLetterCategory[];
  isOpen: boolean;
  onChange: (categories: NewsLetterCategory[]) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = React.useState('');
  const [editing, setEditing] = React.useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (action: () => Promise<NewsLetterCategory[]>) => {
    setBusy(true);
    try {
      onChange(await action());
      return true;
    } catch (error) {
      await alertDialog({ title: 'Không thực hiện được', description: error instanceof Error ? error.message : 'Không thể lưu phân loại.' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!newName.trim()) return;
    if (await run(() => send('/api/news-letter/categories', 'POST', { name: newName }))) setNewName('');
  };
  const rename = async () => {
    if (!editing?.name.trim()) return;
    if (await run(() => send(`/api/news-letter/categories/${editing.id}`, 'PUT', { name: editing.name }))) setEditing(null);
  };
  const remove = async (category: NewsLetterCategory) => {
    if (category.articleCount > 0) {
      await alertDialog({ title: 'Không xoá được phân loại', description: `Phân loại "${category.name}" đang được ${category.articleCount} bài viết sử dụng. Đổi phân loại của các bài viết đó trước.` });
      return;
    }
    if (!(await confirmDialog({ title: 'Xoá phân loại', description: `Xoá phân loại "${category.name}"?`, confirmLabel: 'Xoá' }))) return;
    await run(() => send(`/api/news-letter/categories/${category.id}`, 'DELETE'));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quản trị Phân loại" icon={Tag} maxWidth="md" layer="top">
      <div className="space-y-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            className="ui-input form-control-compact flex-1"
            placeholder="Tên phân loại mới"
            aria-label="Tên phân loại mới"
            maxLength={NEWS_LETTER_CATEGORY_NAME_MAX}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button variant="primary" size="sm" type="submit" disabled={busy || !newName.trim()} icon={<Plus className="size-4" weight="bold" />}>Thêm</Button>
        </form>
        {categories.length === 0 ? (
          <p className="text-sm text-fb-text-secondary">Chưa có phân loại nào.</p>
        ) : (
          <ul className="divide-y divide-fb-border rounded-lg border border-fb-border">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                {editing?.id === category.id ? (
                  <>
                    <input
                      className="ui-input form-control-compact flex-1"
                      aria-label={`Tên mới của ${category.name}`}
                      maxLength={NEWS_LETTER_CATEGORY_NAME_MAX}
                      value={editing.name}
                      autoFocus
                      onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void rename();
                        }
                        if (event.key === 'Escape') setEditing(null);
                      }}
                    />
                    <button type="button" className="grid size-8 place-items-center rounded-md text-status-success hover:bg-fb-control" aria-label="Lưu tên" disabled={busy} onClick={() => void rename()}><Check className="size-4" weight="bold" /></button>
                    <button type="button" className="grid size-8 place-items-center rounded-md text-fb-text-secondary hover:bg-fb-control" aria-label="Huỷ sửa" onClick={() => setEditing(null)}><X className="size-4" weight="bold" /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-fb-text-primary">{category.name}</span>
                    <span className="text-xs text-fb-text-secondary">{category.articleCount} bài</span>
                    <button type="button" className="grid size-8 place-items-center rounded-md text-fb-text-secondary hover:bg-fb-control hover:text-fb-blue" aria-label={`Sửa ${category.name}`} disabled={busy} onClick={() => setEditing({ id: category.id, name: category.name })}><PencilSimple className="size-4" weight="bold" /></button>
                    <button type="button" className="grid size-8 place-items-center rounded-md text-fb-text-secondary hover:bg-fb-control hover:text-status-danger" aria-label={`Xoá ${category.name}`} disabled={busy} onClick={() => void remove(category)}><Trash className="size-4" weight="bold" /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
