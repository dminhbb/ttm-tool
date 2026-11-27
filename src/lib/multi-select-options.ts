// Phần thuần (không React) của dropdown nhiều lựa chọn dùng chung (components/ui/ToolbarMultiSelect.tsx): tìm theo
// chữ, sắp xếp A-Z và nhóm "Pinned items" luôn nằm trên cùng.

export interface MultiSelectChoice {
  label: string;
  value: string;
}

/** Lower-cased, Vietnamese accents stripped — so "du an" finds "Dự án". */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

function byLabel(a: MultiSelectChoice, b: MultiSelectChoice): number {
  return a.label.localeCompare(b.label, 'vi', { numeric: true, sensitivity: 'base' });
}

export interface ArrangedChoices {
  /** Pinned items (by value) that match the search — shown first, always A-Z. */
  pinned: MultiSelectChoice[];
  /** Every other matching item — A-Z when `sort`, else in the order given. */
  others: MultiSelectChoice[];
}

export function arrangeChoices(
  choices: readonly MultiSelectChoice[],
  { pinnedValues = [], query = '', sort = false }: { pinnedValues?: readonly string[]; query?: string; sort?: boolean } = {},
): ArrangedChoices {
  const needle = normalizeSearchText(query);
  const matching = needle
    ? choices.filter((choice) => normalizeSearchText(choice.label).includes(needle) || normalizeSearchText(choice.value).includes(needle))
    : [...choices];
  const pinnedSet = new Set(pinnedValues);
  const pinned = matching.filter((choice) => pinnedSet.has(choice.value)).sort(byLabel);
  const others = matching.filter((choice) => !pinnedSet.has(choice.value));
  return { pinned, others: sort ? others.sort(byLabel) : others };
}
