'use client';

import type { Icon } from '@phosphor-icons/react';

export interface EpicStatWidgetItem {
  icon: Icon;
  isActive: boolean;
  key: string;
  label: string;
  onClick: () => void;
  tone: 'danger' | 'neutral' | 'warning';
  value: number;
}

/**
 * Quick-glance stat tiles above an Epic list table — click one to filter the table to that
 * exact bucket (each item's onClick owns its own filter state), click the active one again to
 * clear it (isActive is the caller's own comparison against current filter state, not tracked
 * here). `gateMessage` replaces the tiles entirely — used when an admin/superadmin-tier viewer
 * hasn't narrowed the Project filter down to a manageable range yet (see each page's own
 * accessRole + projectFilters check).
 */
export function EpicStatWidgets({ gateMessage, items }: { gateMessage?: string; items: EpicStatWidgetItem[] }) {
  if (gateMessage) {
    return <div className="ttm-stat-widgets-gate">{gateMessage}</div>;
  }
  return (
    <div className="ttm-stat-widgets">
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            className={`ttm-stat-widget tone-${item.tone}${item.isActive ? ' is-active' : ''}`}
            onClick={item.onClick}
            aria-pressed={item.isActive}
          >
            <span className="ttm-stat-widget-icon"><ItemIcon size={18} weight="bold" aria-hidden="true" /></span>
            <span className="ttm-stat-widget-text">
              <span className="ttm-stat-widget-value">{item.value}</span>
              <span className="ttm-stat-widget-label">{item.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
