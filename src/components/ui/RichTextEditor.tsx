'use client';

import { useEffect, useId, useRef } from 'react';
import { Eraser, LinkSimple, ListBullets, ListNumbers, TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextUnderline } from '@phosphor-icons/react';

export interface RichTextEditorProps {
  helperText?: string;
  id?: string;
  label?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
}

const TOOLBAR_ACTIONS: { command: string; icon: typeof TextB; label: string }[] = [
  { command: 'bold', icon: TextB, label: 'In đậm' },
  { command: 'italic', icon: TextItalic, label: 'In nghiêng' },
  { command: 'underline', icon: TextUnderline, label: 'Gạch chân' },
  { command: 'insertUnorderedList', icon: ListBullets, label: 'Danh sách chấm' },
  { command: 'insertOrderedList', icon: ListNumbers, label: 'Danh sách số' },
  { command: 'justifyLeft', icon: TextAlignLeft, label: 'Căn trái' },
  { command: 'justifyCenter', icon: TextAlignCenter, label: 'Căn giữa' },
  { command: 'justifyRight', icon: TextAlignRight, label: 'Căn phải' },
];

/**
 * Minimal WYSIWYG editor for the AD Popup message field — contentEditable + document.execCommand,
 * no external editor dependency (execCommand is deprecated from the spec but still functions in
 * every evergreen browser; a from-scratch replacement is out of proportion for one form field).
 * Output is an HTML string — see sanitizeAdPopupHtml for how it's treated as untrusted-ish before
 * storage/render despite only SUPERADMIN being able to author it.
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
export function RichTextEditor({ helperText, id, label, onChange, placeholder, required, value }: RichTextEditorProps) {
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

  const descriptionId = helperText ? `${editorId}-description` : undefined;

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
          {TOOLBAR_ACTIONS.map(({ command, icon: Icon, label: actionLabel }) => (
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
          className="ui-richtext-editor form-control-compact"
          data-placeholder={placeholder}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-describedby={descriptionId}
          aria-required={required}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
        />
      </div>
      {helperText && <p id={descriptionId} className="ui-helper">{helperText}</p>}
    </div>
  );
}
