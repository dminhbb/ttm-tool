'use client';

import * as React from 'react';

export type SortDirection = 'asc' | 'desc';

/** Shared client-side sort state for admin list tables — click a TH to sort by it, click again to flip direction. */
export function useSortableList<K extends string>(defaultKey: K, defaultDirection: SortDirection = 'asc') {
  const [sortKey, setSortKey] = React.useState<K>(defaultKey);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(defaultDirection);

  const toggleSort = (key: K) => {
    if (key === sortKey) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDirection('asc'); }
  };

  const directionFor = (key: K): SortDirection | null => (key === sortKey ? sortDirection : null);

  return { sortKey, sortDirection, toggleSort, directionFor };
}

/** Locale-aware (vi-VN) comparator for a single field, applying `direction`. Nullish values sort last regardless of direction. */
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, direction: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const result = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'vi-VN', { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}
