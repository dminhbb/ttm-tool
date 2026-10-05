'use client';

import React from 'react';

export interface PillToggleOption<T extends string | boolean> {
  value: T;
  label: string;
  activeColor?: string;
}

export interface PillToggleProps<T extends string | boolean> {
  value: T;
  onChange: (value: T) => void;
  options: PillToggleOption<T>[];
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Capsule pill toggle component matching the design of the Lead / PM/SM toggle on TTM Dashboard 2.
 */
export function PillToggle<T extends string | boolean>({
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  size = 'md',
}: PillToggleProps<T>) {
  const isSm = size === 'sm';
  return (
    <div
      className={`inline-flex items-center rounded-full border border-slate-300 bg-[#f0f3f1] p-1 shadow-2xs ${
        disabled ? 'opacity-60 cursor-not-allowed' : ''
      } ${className}`}
      role="radiogroup"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const activeBg = opt.activeColor || 'bg-[#1b6b3e]';
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!disabled && opt.value !== value) {
                onChange(opt.value);
              }
            }}
            className={`flex items-center justify-center rounded-full font-bold transition-all duration-200 ${
              isSm ? 'px-2.5 py-0.5 text-[11px]' : 'px-3.5 py-1 text-xs'
            } ${
              selected
                ? `${activeBg} text-white shadow-xs`
                : 'text-slate-600 hover:text-slate-900 cursor-pointer'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Boolean true / false pill toggle.
 */
export function BooleanPillToggle({
  value,
  onChange,
  disabled = false,
  trueLabel = 'True',
  falseLabel = 'False',
  trueColor = 'bg-[#1b6b3e]',
  falseColor = 'bg-slate-700',
  size = 'md',
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  trueLabel?: string;
  falseLabel?: string;
  trueColor?: string;
  falseColor?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <PillToggle
      value={value}
      onChange={onChange}
      disabled={disabled}
      size={size}
      options={[
        { value: false, label: falseLabel, activeColor: falseColor },
        { value: true, label: trueLabel, activeColor: trueColor },
      ]}
    />
  );
}
