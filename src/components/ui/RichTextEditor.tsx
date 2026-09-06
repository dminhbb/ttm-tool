'use client';

import { useEffect, useId, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { Eraser, LinkSimple, ListBullets, ListNumbers, TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextUnderline } from '@phosphor-icons/react';

export interface RichTextEditorProps {
  helperText?: string;
  id?: string;
  label?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Renders as a single-line field (e.g. a banner's text) — Enter is blocked, pasted text has
   * line breaks stripped, and list/alignment toolbar buttons (nonsensical for one line) are
   * dropped, leaving just Bold/Italic/Underline/Link/Clear formatting. */
  singleLine?: boolean;
  value: string;
}

type ToolbarAction = { command: string; icon: typeof TextB; label: string };

const INLINE_ACTIONS: ToolbarAction[] = [
  { command: 'bold', icon: TextB, label: 'In đậm' },
  { command: 'italic', icon: TextItalic, label: 'In nghiêng' },
  { command: 'underline', icon: TextUnderline, label: 'Gạch chân' },
];

const BLOCK_ACTIONS: ToolbarAction[] = [
  { command: 'insertUnorderedList', icon: ListBullets, label: 'Danh sách chấm' },
  { command: 'insertOrderedList', icon: ListNumbers, label: 'Danh sách số' },
  { command: 'justifyLeft', icon: TextAlignLeft, label: 'Căn trái' },
  { command: 'justifyCenter', icon: TextAlignCenter, label: 'Căn giữa' },
  { command: 'justifyRight', icon: TextAlignRight, label: 'Căn phải' },
];

/**
 * Minimal WYSIWYG editor — contentEditable + document.execCommand, no external editor dependency
 * (execCommand is deprecated from the spec but still functions in every evergreen browser; a
 * from-scratch replacement is out of proportion for a form field or two). Output is an HTML string
 * — see sanitizeAdPopupHtml for how it's treated as untrusted-ish before storage/render despite
 * only trusted admin roles being able to author it.
 *
 * Not built on FormField: FormField clones its single child to inject `id`, which would land on
 * this component's outer wrapper (toolbar + editable area) rather than the editable div itself,
 * producing a duplicate id and a label that can't focus the actual control. This replicates
 * FormField's label/helper markup directly instead, keeping `id` on the one element that needs it.
 *
 * Deliberately "uncontrolled after mount": `value` only re-syncs the DOM when it changes from
 * OUTSIDE this component's own onInput (tracked via lastValueRef) — never on every keystroke, which
 * would otherwise reset the caret position mid-typing.
 */
export function RichTextEditor({ helperText, id, label, onChange, placeholder, required, singleLine = false, value }: RichTextEditorProps) {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef<string | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (el && value !== lastValueRef.current) {
      el.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const emitChange = () => {
    const html = editorRef.current?.innerHTML ?? '';
    lastValueRef.current = html;
    onChange(html);
  };

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const insertLink = () => {
    const url = window.prompt('Nhập URL liên kết:');
    if (url) exec('createLink', url);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (singleLine && event.key === 'Enter') event.preventDefault();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!singleLine) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ');
    document.execCommand('insertText', false, text);
    emitChange();
  };

  const descriptionId = helperText ? `${editorId}-description` : undefined;
  const toolbarActions = singleLine ? INLINE_ACTIONS : [...INLINE_ACTIONS, ...BLOCK_ACTIONS];

  return (
    <div className="ui-field">
      {label && (
        <label htmlFor={editorId} className="ui-label">
          {label}
          {required && <span className="ml-1 text-status-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="ui-richtext">
        <div className="ui-richtext-toolbar" role="toolbar" aria-label="Định dạng văn bản">
          {toolbarActions.map(({ command, icon: Icon, label: actionLabel }) => (
            <button
              key={command}
              type="button"
              className="ui-richtext-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => exec(command)}
              aria-label={actionLabel}
              title={actionLabel}
            >
              <Icon size={16} weight="bold" />
            </button>
          ))}
          <button
            type="button"
            className="ui-richtext-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={insertLink}
            aria-label="Chèn liên kết"
            title="Chèn liên kết"
          >
            <LinkSimple size={16} weight="bold" />
          </button>
          <button
            type="button"
            className="ui-richtext-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => exec('removeFormat')}
            aria-label="Xóa định dạng"
            title="Xóa định dạng"
          >
            <Eraser size={16} weight="bold" />
          </button>
        </div>
        <div
          ref={editorRef}
          id={editorId}
          className={`ui-richtext-editor form-control-compact${singleLine ? ' ui-richtext-editor--single-line' : ''}`}
          data-placeholder={placeholder}
          contentEditable
          role="textbox"
          aria-multiline={!singleLine}
          aria-label={label}
          aria-describedby={descriptionId}
          aria-required={required}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
      {helperText && <p id={descriptionId} className="ui-helper">{helperText}</p>}
    </div>
  );
}
