'use client';

import * as React from 'react';
import '@/app/rich-text.css';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsMerge, Columns, ColumnsPlusRight, Eraser, ImageSquare, LinkSimple, ListBullets,
  ListNumbers, Quotes, Rows, RowsPlusBottom, SquareSplitHorizontal, Table as TableIcon, TextAlignCenter, TextAlignLeft,
  TextAlignRight, TextB, TextHThree, TextHTwo, TextItalic, TextStrikethrough, TextUnderline, Trash,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { alertDialog, promptDialog } from '@/components/ui/dialogs';
import { cn } from '@/lib/utils';

/**
 * The app's WYSIWYG editor (owner 2026-11-06), built on TipTap: "Bản tin" articles and the "Popup quảng cáo" message.
 * TipTap keeps the content inside a fixed schema (only the nodes / marks of the extensions below survive a paste), and
 * the server sanitizes whatever arrives again before storing it (lib/rich-html-sanitizer.ts) — the editor is never the
 * security boundary.
 *
 * Images (articles only): picked with the toolbar button, pasted or dropped — each one is resized in the browser,
 * uploaded through `images.upload` and inserted by URL; a pasted data: image is never kept (allowBase64: false).
 */

export interface TiptapEditorImages {
  /** Uploads one image → its URL (or throws with a message to show). */
  upload: (file: File) => Promise<string>;
  /** Most images the content may hold. */
  max: number;
  accept: string;
}

export interface TiptapEditorProps {
  value: string;
  onChange: (html: string) => void;
  id?: string;
  label?: string;
  helperText?: string;
  placeholder?: string;
  required?: boolean;
  /** Headings H2 / H3 (articles). */
  headings?: boolean;
  /** Tables: insert, add / delete rows and columns, merge / split cells, delete. */
  tables?: boolean;
  images?: TiptapEditorImages;
  /** Height of the writing area, e.g. 'min-h-[480px]'. */
  minHeightClassName?: string;
}

function countImages(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') count += 1;
  });
  return count;
}

function ToolbarButton({ active, disabled, icon: ButtonIcon, label, onClick }: { active?: boolean; disabled?: boolean; icon: Icon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-md text-fb-text-secondary transition-colors hover:bg-fb-control hover:text-fb-text-primary disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-fb-blue-soft text-fb-blue',
      )}
    >
      <ButtonIcon className="size-4" weight="bold" />
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px bg-fb-border" aria-hidden="true" />;
}

export function TiptapEditor({ helperText, headings = false, id, images, label, minHeightClassName = 'min-h-[180px]', onChange, placeholder, required, tables = false, value }: TiptapEditorProps) {
  const generatedId = React.useId();
  const editorId = id ?? generatedId;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const imagesRef = React.useRef(images);
  // The paste / drop handlers are created once with the editor: they call the latest insertFiles through this ref.
  const insertFilesRef = React.useRef<((files: File[]) => Promise<void>) | null>(null);
  React.useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: headings ? { levels: [2, 3] } : false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ...(images ? [Image.configure({ inline: false, allowBase64: false })] : []),
      ...(tables ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell] : []),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value || '',
    editorProps: {
      attributes: { id: editorId, class: cn('rich-content rich-editor-area', minHeightClassName), 'aria-label': label ?? 'Nội dung' },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/'));
        if (!files.length || !imagesRef.current) return false;
        event.preventDefault();
        void insertFilesRef.current?.(files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])].filter((file) => file.type.startsWith('image/'));
        if (!files.length || !imagesRef.current) return false;
        event.preventDefault();
        void insertFilesRef.current?.(files);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? '' : current.getHTML()),
  });

  // Content loaded from outside (e.g. the article arrives after the editor mounted).
  React.useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  async function insertFiles(files: File[]) {
    const config = imagesRef.current;
    if (!editor || !config) return;
    const room = config.max - countImages(editor);
    if (room <= 0) {
      await alertDialog({ title: 'Đã đủ số ảnh', description: `Mỗi bài viết có tối đa ${config.max} ảnh trong nội dung.` });
      return;
    }
    if (files.length > room) {
      await alertDialog({ title: 'Quá số ảnh cho phép', description: `Chỉ chèn thêm được ${room} ảnh (tối đa ${config.max} ảnh trong nội dung) — các ảnh còn lại bị bỏ qua.` });
    }
    setUploading(true);
    try {
      for (const file of files.slice(0, room)) {
        const src = await config.upload(file);
        editor.chain().focus().setImage({ src, alt: '' }).run();
      }
    } catch (error) {
      await alertDialog({ title: 'Không chèn được ảnh', description: error instanceof Error ? error.message : 'Không thể tải ảnh lên.' });
    } finally {
      setUploading(false);
    }
  }

  React.useEffect(() => {
    insertFilesRef.current = insertFiles;
  });

  async function editLink() {
    if (!editor) return;
    const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
    const url = await promptDialog({ title: 'Chèn liên kết', label: 'Địa chỉ liên kết (để trống để bỏ liên kết)', defaultValue: previous, inputType: 'url', placeholder: 'https://...' });
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(trimmed)) {
      await alertDialog({ title: 'Liên kết không hợp lệ', description: 'Chỉ nhận liên kết bắt đầu bằng http://, https:// hoặc mailto:.' });
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  }

  const inTable = Boolean(editor?.isActive('table'));
  const chain = () => editor!.chain().focus();

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={editorId} className="block text-sm font-semibold text-fb-text-primary">
          {label}
          {required && <span className="ml-0.5 text-status-danger">*</span>}
        </label>
      )}
      <div className="rich-editor overflow-hidden rounded-lg border border-fb-border bg-fb-surface">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-fb-border bg-fb-surface-muted px-1.5 py-1" role="toolbar" aria-label="Định dạng nội dung">
          <ToolbarButton icon={ArrowCounterClockwise} label="Hoàn tác" disabled={!editor?.can().undo()} onClick={() => chain().undo().run()} />
          <ToolbarButton icon={ArrowClockwise} label="Làm lại" disabled={!editor?.can().redo()} onClick={() => chain().redo().run()} />
          <Separator />
          {headings && (
            <>
              <ToolbarButton icon={TextHTwo} label="Tiêu đề lớn" active={editor?.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
              <ToolbarButton icon={TextHThree} label="Tiêu đề nhỏ" active={editor?.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
              <Separator />
            </>
          )}
          <ToolbarButton icon={TextB} label="In đậm" active={editor?.isActive('bold')} onClick={() => chain().toggleBold().run()} />
          <ToolbarButton icon={TextItalic} label="In nghiêng" active={editor?.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
          <ToolbarButton icon={TextUnderline} label="Gạch chân" active={editor?.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
          <ToolbarButton icon={TextStrikethrough} label="Gạch ngang" active={editor?.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
          <ToolbarButton icon={LinkSimple} label="Liên kết" active={editor?.isActive('link')} onClick={() => void editLink()} />
          <Separator />
          <ToolbarButton icon={ListBullets} label="Danh sách chấm" active={editor?.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
          <ToolbarButton icon={ListNumbers} label="Danh sách số" active={editor?.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
          <ToolbarButton icon={Quotes} label="Trích dẫn" active={editor?.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
          <Separator />
          <ToolbarButton icon={TextAlignLeft} label="Căn trái" active={editor?.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
          <ToolbarButton icon={TextAlignCenter} label="Căn giữa" active={editor?.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
          <ToolbarButton icon={TextAlignRight} label="Căn phải" active={editor?.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
          {images && (
            <>
              <Separator />
              <ToolbarButton icon={ImageSquare} label={uploading ? 'Đang tải ảnh…' : `Chèn ảnh (tối đa ${images.max})`} disabled={uploading} onClick={() => fileInputRef.current?.click()} />
              <input
                ref={fileInputRef}
                type="file"
                accept={images.accept}
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  if (files.length) void insertFiles(files);
                }}
              />
            </>
          )}
          {tables && (
            <>
              <Separator />
              <ToolbarButton icon={TableIcon} label="Chèn bảng 3×3" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
              <ToolbarButton icon={RowsPlusBottom} label="Thêm dòng bên dưới" disabled={!inTable} onClick={() => chain().addRowAfter().run()} />
              <ToolbarButton icon={Rows} label="Xoá dòng" disabled={!inTable} onClick={() => chain().deleteRow().run()} />
              <ToolbarButton icon={ColumnsPlusRight} label="Thêm cột bên phải" disabled={!inTable} onClick={() => chain().addColumnAfter().run()} />
              <ToolbarButton icon={Columns} label="Xoá cột" disabled={!inTable} onClick={() => chain().deleteColumn().run()} />
              <ToolbarButton icon={ArrowsMerge} label="Gộp ô đã chọn" disabled={!editor?.can().mergeCells()} onClick={() => chain().mergeCells().run()} />
              <ToolbarButton icon={SquareSplitHorizontal} label="Tách ô" disabled={!editor?.can().splitCell()} onClick={() => chain().splitCell().run()} />
              <ToolbarButton icon={Trash} label="Xoá bảng" disabled={!inTable} onClick={() => chain().deleteTable().run()} />
            </>
          )}
          <Separator />
          <ToolbarButton icon={Eraser} label="Xoá định dạng" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
        </div>
        <EditorContent editor={editor} />
      </div>
      {helperText && <p className="text-xs text-fb-text-secondary">{helperText}</p>}
    </div>
  );
}
