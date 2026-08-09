import * as React from 'react';
import { CloudArrowUp, FileCsv } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface FileDropzoneProps {
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
}

export function FileDropzone({ file, inputRef, onChange, onDragOver, onDrop }: FileDropzoneProps) {
  const inputId = React.useId();

  return (
    <label
      htmlFor={inputId}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-fb-surface-muted px-6 py-10 text-center outline-none transition-[border-color,background-color] duration-150 focus-within:border-fb-blue',
        file ? 'border-fb-blue/45 bg-fb-blue-soft/45' : 'border-fb-border-strong bg-fb-surface-muted hover:border-fb-blue hover:bg-fb-blue-soft/35',
      )}
    >
      <input
        id={inputId}
        type="file"
        ref={inputRef}
        onChange={onChange}
        accept=".csv,text/csv"
        className="sr-only"
      />
      <div className="grid size-12 place-items-center rounded-2xl bg-fb-surface text-fb-blue shadow-sm ring-1 ring-fb-border transition-transform group-hover:-translate-y-0.5">
        {file
          ? <FileCsv className="size-6" weight="fill" aria-hidden="true" />
          : <CloudArrowUp className="size-6" weight="bold" aria-hidden="true" />}
      </div>
      {file ? (
        <div className="min-w-0">
          <p className="max-w-full truncate text-sm font-bold text-fb-text-primary">{file.name}</p>
          <p className="mt-1 text-xs font-medium text-fb-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-bold text-fb-text-primary">Kéo thả file CSV hoặc chọn từ máy</p>
          <p className="mt-1 text-xs text-fb-text-secondary">Chấp nhận file .csv xuất từ Jira</p>
        </div>
      )}
    </label>
  );
}
