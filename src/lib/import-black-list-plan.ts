import type { TtmAppliedKind } from '@/lib/scoring/types';

/** Pure part of the import black list (see import-black-list.ts) — no database, unit tested. */

export interface ImportedEpicTtmApplied {
  epicKey: string;
  projectKey: string;
  ttmApplied: TtmAppliedKind;
}

export interface ExistingBlackListRow {
  blackListed: boolean;
  source: 'MANUAL' | 'IMPORT';
}

export interface ImportBlackListPlan {
  add: { epicKey: string; projectKey: string }[];
  remove: string[];
}

/** Pure: what the import changes in the black list, from the Epics of the file and the rows already there (keys upper-cased). */
export function planImportBlackList(epics: readonly ImportedEpicTtmApplied[], existing: ReadonlyMap<string, ExistingBlackListRow>): ImportBlackListPlan {
  const add = new Map<string, { epicKey: string; projectKey: string }>();
  const remove = new Set<string>();
  for (const epic of epics) {
    const epicKey = epic.epicKey.trim().toUpperCase();
    const row = existing.get(epicKey);
    if (epic.ttmApplied === 'NOT_APPLICABLE') {
      if (!row?.blackListed) add.set(epicKey, { epicKey, projectKey: epic.projectKey.trim().toUpperCase() });
    } else if (row?.source === 'IMPORT') {
      remove.add(epicKey);
    }
  }
  return { add: [...add.values()], remove: [...remove] };
}
