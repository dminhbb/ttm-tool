'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FloppyDisk, ImageSquare, NotePencil, Plus, Trash, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { TiptapEditor } from '@/components/ui/TiptapEditor';
import { alertDialog, confirmDialog } from '@/components/ui/dialogs';
import { cn } from '@/lib/utils';
import { CategoryManagerModal } from '@/components/news-letter/CategoryManagerModal';
import { notifyNewsLetterChanged } from '@/components/news-letter/NewsLetterShell';
import { ACCEPTED_IMAGE_TYPES, uploadNewsLetterImageFile } from '@/lib/news-letter/resize-image';
import {
  NEWS_LETTER_MAX_ARTICLE_IMAGES,
  NEWS_LETTER_ROLE_LABEL,
  NEWS_LETTER_ROLES,
  NEWS_LETTER_ROUTE,
  NEWS_LETTER_SUMMARY_MAX,
  NEWS_LETTER_TITLE_MAX,
  newsLetterImageUrl,
  type NewsLetterArticle,
  type NewsLetterArticleInput,
  type NewsLetterCategory,
} from '@/lib/news-letter/types';
import type { UserRole } from '@/lib/auth-types';

/**
 * "Soạn bài viết" of "Bản tin" (SUPERADMIN, owner 2026-11-06): title + Published switch (off = only the author sees it),
 * summary, category (A→Z, "+" = Quản trị Phân loại) + roles allowed to read it (all by default), header image (cropped
 * to 16:7 in the browser), and the body (TipTap: tables, at most 4 images — picked, pasted or dropped). The server
 * sanitizes the HTML and checks every image before saving.
 */

const EMPTY: NewsLetterArticleInput = {
  title: '',
  summary: '',
  categoryId: null,
  visibleRoles: [...NEWS_LETTER_ROLES],
  isPublished: false,
  headerImageId: null,
  contentHtml: '',
};

function PublishedSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-fb-text-primary">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Published"
        onClick={() => onChange(!checked)}
        className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-fb-blue', checked ? 'bg-status-success' : 'bg-fb-border')}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
      <span>{checked ? 'Published' : 'Nháp'}</span>
    </label>
  );
}

export function NewsLetterEditor({ articleId }: { articleId: number | null }) {
  const router = useRouter();
  const [form, setForm] = React.useState<NewsLetterArticleInput>(EMPTY);
  const [loaded, setLoaded] = React.useState(articleId === null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [categories, setCategories] = React.useState<NewsLetterCategory[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploadingHeader, setUploadingHeader] = React.useState(false);
  const headerInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let active = true;
    void fetch('/api/news-letter/categories', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { categories: [] }))
      .then((data: { categories?: NewsLetterCategory[] }) => {
        if (active) setCategories(data.categories ?? []);
      });
    if (articleId !== null) {
      void fetch(`/api/news-letter/articles/${articleId}`, { cache: 'no-store' })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as { article?: NewsLetterArticle; error?: string };
          if (!active) return;
          if (!response.ok || !data.article) {
            setLoadError(data.error || 'Không thể tải bài viết.');
            return;
          }
          const article = data.article;
          setForm({
            title: article.title,
            summary: article.summary ?? '',
            categoryId: article.categoryId,
            visibleRoles: article.visibleRoles,
            isPublished: article.isPublished,
            headerImageId: article.headerImageId,
            contentHtml: article.contentHtml,
          });
          setLoaded(true);
        });
    }
    return () => {
      active = false;
    };
  }, [articleId]);

  const update = <K extends keyof NewsLetterArticleInput>(key: K, value: NewsLetterArticleInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const uploadInline = React.useCallback(async (file: File) => (await uploadNewsLetterImageFile(file, 'INLINE')).url, []);
  const images = React.useMemo(() => ({ upload: uploadInline, max: Math.max(0, NEWS_LETTER_MAX_ARTICLE_IMAGES - (form.headerImageId ? 1 : 0)), accept: ACCEPTED_IMAGE_TYPES }), [uploadInline, form.headerImageId]);

  const pickHeader = async (file: File) => {
    setUploadingHeader(true);
    try {
      const { id } = await uploadNewsLetterImageFile(file, 'HEADER');
      update('headerImageId', id);
    } catch (error) {
      await alertDialog({ title: 'Không tải được ảnh header', description: error instanceof Error ? error.message : 'Không thể tải ảnh lên.' });
    } finally {
      setUploadingHeader(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      await alertDialog({ title: 'Thiếu tiêu đề', description: 'Nhập tiêu đề bài viết trước khi lưu.' });
      return;
    }
    if (!form.visibleRoles.length) {
      await alertDialog({ title: 'Thiếu phân quyền', description: 'Chọn ít nhất 1 role được xem bài viết.' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(articleId === null ? '/api/news-letter/articles' : `/api/news-letter/articles/${articleId}`, {
        method: articleId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: number; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || 'Không thể lưu bài viết.');
      notifyNewsLetterChanged();
      router.push(`${NEWS_LETTER_ROUTE}/${data.id}`);
    } catch (error) {
      await alertDialog({ title: 'Không lưu được bài viết', description: error instanceof Error ? error.message : 'Không thể lưu bài viết.' });
      setSaving(false);
    }
  };

  const remove = async () => {
    if (articleId === null) return;
    if (!(await confirmDialog({ title: 'Xoá bài viết', description: `Xoá bài viết "${form.title}"? Ảnh của bài viết và lịch sử thay đổi cũng bị xoá, không khôi phục được.`, confirmLabel: 'Xoá bài viết' }))) return;
    setSaving(true);
    const response = await fetch(`/api/news-letter/articles/${articleId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      await alertDialog({ title: 'Không xoá được bài viết', description: data.error || 'Không thể xoá bài viết.' });
      setSaving(false);
      return;
    }
    notifyNewsLetterChanged();
    router.push(NEWS_LETTER_ROUTE);
  };

  const back = () => router.push(articleId === null ? NEWS_LETTER_ROUTE : `${NEWS_LETTER_ROUTE}/${articleId}`);

  if (loadError) return <p className="py-16 text-center text-sm text-status-danger">{loadError}</p>;
  if (!loaded) return <p className="py-16 text-center text-sm text-fb-text-secondary">Đang tải bài viết…</p>;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={back} className="grid size-9 place-items-center rounded-md border border-fb-border text-fb-text-secondary hover:bg-fb-control" aria-label="Quay lại">
            <ArrowLeft className="size-4" weight="bold" />
          </button>
          <h1 className="flex items-center gap-2 text-lg font-bold text-fb-text-primary">
            <NotePencil className="size-5 text-fb-blue" weight="bold" aria-hidden="true" />
            {articleId === null ? 'Soạn bài viết' : 'Sửa bài viết'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {articleId !== null && (
            <Button variant="danger" size="sm" disabled={saving} onClick={() => void remove()} icon={<Trash className="size-4" weight="bold" />}>Xoá bài</Button>
          )}
          <Button variant="outline" size="sm" disabled={saving} onClick={back}>Huỷ</Button>
          <Button variant="primary" size="sm" isLoading={saving} onClick={() => void save()} icon={<FloppyDisk className="size-4" weight="bold" />}>Lưu</Button>
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-fb-border bg-fb-surface p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="news-title" className="mb-1.5 block text-sm font-semibold text-fb-text-primary">Tiêu đề<span className="ml-0.5 text-status-danger">*</span></label>
            <input id="news-title" className="ui-input form-control-compact w-full" maxLength={NEWS_LETTER_TITLE_MAX} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="Tiêu đề bài viết" />
          </div>
          <div className="pb-1.5">
            <PublishedSwitch checked={form.isPublished} onChange={(value) => update('isPublished', value)} />
          </div>
        </div>
        <p className="-mt-3 text-xs text-fb-text-secondary">Published tắt: bài viết là nháp, chỉ bạn xem được (không SUPERADMIN nào khác thấy).</p>

        <div>
          <label htmlFor="news-summary" className="mb-1.5 block text-sm font-semibold text-fb-text-primary">Tóm tắt</label>
          <textarea id="news-summary" rows={2} className="ui-input w-full resize-y py-2" maxLength={NEWS_LETTER_SUMMARY_MAX} value={form.summary} onChange={(event) => update('summary', event.target.value)} placeholder="Một hai câu hiện in nghiêng dưới tiêu đề (không bắt buộc)" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="news-category" className="mb-1.5 block text-sm font-semibold text-fb-text-primary">Phân loại</label>
            <div className="flex items-center gap-2">
              <select id="news-category" className="ui-input form-control-compact flex-1" value={form.categoryId ?? ''} onChange={(event) => update('categoryId', event.target.value ? Number(event.target.value) : null)}>
                <option value="">— Chưa phân loại —</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button type="button" onClick={() => setCategoryModalOpen(true)} className="grid size-9 shrink-0 place-items-center rounded-md border border-fb-border text-fb-text-secondary hover:border-fb-blue hover:text-fb-blue" aria-label="Quản trị Phân loại" title="Quản trị Phân loại">
                <Plus className="size-4" weight="bold" />
              </button>
            </div>
          </div>
          <MultiSelect
            label="Phân quyền xem"
            options={NEWS_LETTER_ROLES.map((role) => ({ value: role, label: NEWS_LETTER_ROLE_LABEL[role] ?? role }))}
            value={form.visibleRoles}
            onChange={(values) => update('visibleRoles', values as UserRole[])}
            placeholder="Chọn role được xem"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-fb-text-primary">Ảnh header</p>
          {form.headerImageId ? (
            <div className="relative overflow-hidden rounded-lg border border-fb-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the app's own image API (stored in the database). */}
              <img src={newsLetterImageUrl(form.headerImageId)} alt="Ảnh header" className="aspect-[16/7] w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-2">
                <Button variant="secondary" size="sm" disabled={uploadingHeader} onClick={() => headerInputRef.current?.click()} icon={<ImageSquare className="size-4" weight="bold" />}>Đổi ảnh</Button>
                <Button variant="secondary" size="sm" onClick={() => update('headerImageId', null)} icon={<X className="size-4" weight="bold" />}>Bỏ ảnh</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploadingHeader}
              onClick={() => headerInputRef.current?.click()}
              className="flex aspect-[16/5] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-fb-border text-fb-text-secondary hover:border-fb-blue hover:text-fb-blue disabled:opacity-60"
            >
              <ImageSquare className="size-7" weight="bold" aria-hidden="true" />
              <span className="text-sm font-semibold">{uploadingHeader ? 'Đang tải ảnh…' : 'Chọn ảnh header'}</span>
              <span className="text-xs">PNG, JPEG, WebP, GIF — ảnh được cắt giữa theo tỉ lệ 16:7, rộng tối đa 1600px</span>
            </button>
          )}
          <input
            ref={headerInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void pickHeader(file);
            }}
          />
        </div>

        <TiptapEditor
          label="Nội dung bài viết"
          value={form.contentHtml}
          onChange={(html) => update('contentHtml', html)}
          headings
          tables
          images={images}
          placeholder="Viết nội dung bài viết… (dán hoặc kéo thả ảnh vào đây)"
          minHeightClassName="min-h-[480px]"
          helperText={`Tối đa ${NEWS_LETTER_MAX_ARTICLE_IMAGES} ảnh mỗi bài (kể cả ảnh header), mỗi ảnh ≤ 1 MB — chọn bằng nút ảnh, dán (Ctrl+V) hoặc kéo thả; ảnh rộng hơn 1200px được thu nhỏ.`}
        />
      </div>

      <CategoryManagerModal isOpen={categoryModalOpen} categories={categories} onChange={setCategories} onClose={() => setCategoryModalOpen(false)} />
    </div>
  );
}
