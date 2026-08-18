'use client';

import * as React from 'react';
import { Check } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { applyThemeBrand, DEFAULT_THEME_BRAND, isThemeBrand, type ThemeBrand } from '@/lib/theme-brand';

function subscribeToBrandAttribute(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-brand'] });
  return () => observer.disconnect();
}

function readAppliedBrand(): ThemeBrand {
  const attr = document.documentElement.getAttribute('data-brand');
  return isThemeBrand(attr) ? attr : DEFAULT_THEME_BRAND;
}

const OPTIONS: { id: ThemeBrand; label: string; swatch: string[] }[] = [
  { id: 'wise', label: 'Lime theme', swatch: ['#e8ebe6', '#9fe870', '#0e0f0c'] },
  { id: 'legacy', label: 'Navy theme', swatch: ['#e9ecef', '#0284c7', '#0f172a'] },
];

export function AppearancePanel() {
  // Reads the attribute the blocking init script already applied, via useSyncExternalStore so
  // the server snapshot is always the default (no hydration mismatch) and no effect-driven
  // setState is needed to pick up the real value after mount.
  const brand = React.useSyncExternalStore(subscribeToBrandAttribute, readAppliedBrand, () => DEFAULT_THEME_BRAND);

  const select = (next: ThemeBrand) => {
    if (next === brand) return;
    applyThemeBrand(next);
    // A handful of the theme's inherited CSS custom properties (radius, surface colors) don't
    // reliably recompute on descendant rules from a live attribute change alone in this app's
    // dev setup — only font-family did. Reloading re-applies everything through the same
    // (verified-reliable) path as a fresh page load, via the blocking init script.
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fb-text-secondary">
        Chọn giao diện hiển thị cho ứng dụng. Lựa chọn được lưu trên trình duyệt này.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const active = brand === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => select(option.id)}
              aria-pressed={active}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4 text-left outline-none transition-colors',
                active ? 'border-fb-blue bg-fb-blue-soft' : 'border-fb-border bg-fb-surface hover:bg-fb-control',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex overflow-hidden rounded-md border border-fb-border">
                  {option.swatch.map((color, index) => (
                    <span key={index} className="h-6 w-6" style={{ backgroundColor: color }} aria-hidden="true" />
                  ))}
                </span>
                {active && (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fb-blue text-white">
                    <Check className="size-3.5" weight="bold" aria-hidden="true" />
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-fb-text-primary">{option.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
