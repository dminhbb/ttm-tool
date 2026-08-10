export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function fuzzyIncludes(searchTerm: string, values: Array<string | null | undefined>): boolean {
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  if (!normalizedSearchTerm) return true;
  return values.some((value) => normalizeSearchText(value ?? '').includes(normalizedSearchTerm));
}
