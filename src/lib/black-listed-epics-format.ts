/**
 * Text format of the "Epic ngoại lệ" popup — one project per line:
 *
 *   PAMS:PAMS-1234,PAMS-5678
 *   ALM:ALM-23455,ALM-294759
 *
 * A project key (letters and digits only, no "-") at the start of the line, then ":" and that
 * project's Epic keys separated by ",". Pure (no db) so the popup's "Kiểm tra thông tin" button and
 * the API validate with the very same code, and both can point at the exact characters at fault.
 */

export interface BlackListedEpicEntry {
  epicKey: string;
  projectKey: string;
}

export interface BlackListFormatError {
  /** 1-based line number in the text as typed. */
  line: number;
  /** 1-based position of the first / last character at fault within that line. */
  columnStart: number;
  columnEnd: number;
  /** The characters at fault ('' when something is missing at that position). */
  excerpt: string;
  message: string;
}

export interface BlackListParseResult {
  entries: BlackListedEpicEntry[];
  errors: BlackListFormatError[];
}

export const BLACK_LIST_FORMAT_EXAMPLE = 'PAMS:PAMS-1234,PAMS-5678\nALM:ALM-23455,ALM-294759';

const PROJECT_KEY_PATTERN = /^[A-Za-z0-9]+$/;

/** A token's text with surrounding blanks removed, and where it sits in its line (1-based). */
function trimmedSpan(text: string, offset: number): { end: number; start: number; value: string } {
  const value = text.trim();
  if (!value) return { end: offset + Math.max(text.length, 1), start: offset + 1, value };
  const start = offset + text.indexOf(value) + 1;
  return { end: start + value.length - 1, start, value };
}

export function parseBlackListText(text: string): BlackListParseResult {
  const entries: BlackListedEpicEntry[] = [];
  const errors: BlackListFormatError[] = [];
  const projectLine = new Map<string, number>();
  const epicLine = new Map<string, number>();

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    if (!rawLine.trim()) return;
    const fail = (columnStart: number, columnEnd: number, message: string) => {
      errors.push({ columnEnd, columnStart, excerpt: rawLine.slice(columnStart - 1, columnEnd), line, message });
    };

    const colon = rawLine.indexOf(':');
    if (colon < 0) {
      fail(1, rawLine.length, 'Thiếu dấu ":" ngăn cách Project Key với danh sách Epic.');
      return;
    }
    const project = trimmedSpan(rawLine.slice(0, colon), 0);
    if (!project.value) {
      fail(1, colon + 1, 'Thiếu Project Key ở đầu dòng (trước dấu ":").');
      return;
    }
    if (!PROJECT_KEY_PATTERN.test(project.value)) {
      fail(project.start, project.end, 'Project Key chỉ gồm chữ và số, không có ký tự "-" hay ký tự đặc biệt.');
      return;
    }
    const projectKey = project.value.toUpperCase();
    const firstLine = projectLine.get(projectKey);
    if (firstLine !== undefined) {
      fail(project.start, project.end, `Project ${projectKey} đã được khai báo ở dòng ${firstLine} — mỗi project chỉ khai báo trên 1 dòng.`);
      return;
    }
    projectLine.set(projectKey, line);

    const epicsText = rawLine.slice(colon + 1);
    if (!epicsText.trim()) {
      fail(colon + 1, Math.max(rawLine.length, colon + 1), `Thiếu danh sách Epic sau dấu ":" của project ${projectKey}.`);
      return;
    }
    const epicPattern = new RegExp(`^${projectKey}-[0-9]+$`);
    let offset = colon + 1;
    for (const part of epicsText.split(',')) {
      const epic = trimmedSpan(part, offset);
      offset += part.length + 1;
      if (!epic.value) {
        fail(epic.start, epic.end, 'Thiếu Epic key (thừa dấu "," hoặc để trống giữa hai dấu ",").');
        continue;
      }
      const epicKey = epic.value.toUpperCase();
      if (!epicPattern.test(epicKey)) {
        fail(epic.start, epic.end, `Epic key không hợp lệ — phải có dạng ${projectKey}-<số> (ví dụ ${projectKey}-1234).`);
        continue;
      }
      const duplicateLine = epicLine.get(epicKey);
      if (duplicateLine !== undefined) {
        fail(epic.start, epic.end, `Epic ${epicKey} bị khai báo trùng${duplicateLine === line ? ' trên cùng dòng' : ` (đã có ở dòng ${duplicateLine})`}.`);
        continue;
      }
      epicLine.set(epicKey, line);
      entries.push({ epicKey, projectKey });
    }
  });

  return { entries, errors };
}

/** "PAMS-1234" → 1234, for ordering a project's Epics by number instead of as text. */
function epicNumber(epicKey: string): number {
  return Number(epicKey.slice(epicKey.lastIndexOf('-') + 1)) || 0;
}

/** The stored black list back in the popup's text format — projects A→Z, Epics by number. */
export function formatBlackListText(entries: readonly BlackListedEpicEntry[]): string {
  const byProject = new Map<string, string[]>();
  for (const entry of entries) {
    const keys = byProject.get(entry.projectKey) ?? [];
    keys.push(entry.epicKey);
    byProject.set(entry.projectKey, keys);
  }
  return [...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([projectKey, keys]) => `${projectKey}:${keys.sort((a, b) => epicNumber(a) - epicNumber(b) || a.localeCompare(b)).join(',')}`)
    .join('\n');
}

/** Project key of a standalone Epic key ("PAMS-1234" → "PAMS"), or null when it isn't one. */
export function projectKeyOfEpicKey(epicKey: string): string | null {
  const match = /^([A-Za-z0-9]+)-[0-9]+$/.exec(epicKey.trim());
  return match ? match[1].toUpperCase() : null;
}
