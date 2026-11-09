import type { EpicPhaseCompletionFacts, TtmPhaseKey } from './types';
import type { ScoringParameters } from './parameters';

/**
 * Phase completion of DEV / TEST / PENTEST / R4GOLIVE from the Epic's Stories (owner rules 2026-11-08):
 * every Story status maps to one level of the Epic's phases, and a phase is done once a share of the
 * Epic's Stories (`phase.storyDoneRatio`, default 80 %) has reached that phase's "done" level — or, for an
 * Epic with enough Stories (`phase.storyDoneTolerance`), once at most 1 Story is still behind. Cancelled
 * and Pending Stories are skipped (neither counted nor blocking). A "Task PENTEST" is not a Story here: it
 * counts with the Pentest subtasks (`EpicPhaseCompletionFacts.pentestTasks`). A status not listed here counts as
 * level 0 and is surfaced in the phase note so it can be classified.
 */
export const STORY_PHASE_LEVELS: readonly { level: number; label: string; statuses: readonly string[] }[] = [
  { level: 0, label: 'Chưa vào DEV', statuses: ['TO DO', 'ANALYZING', 'READY FOR REFINE', 'WAITING FOR PLANNING', 'READY FOR DEV'] },
  { level: 1, label: 'DEV đang làm', statuses: ['IN DEV', 'REOPENED'] },
  { level: 2, label: 'DEV xong', statuses: ['DEV DONE', 'READY FOR TEST'] },
  { level: 3, label: 'TEST đang làm', statuses: ['IN SIT', 'SIT DONE', 'READY FOR UAT', 'IN UAT'] },
  { level: 4, label: 'TEST xong', statuses: ['UAT DONE', 'PENTEST'] },
  { level: 5, label: 'R4GOLIVE', statuses: ['READY FOR GOLIVE'] },
  { level: 6, label: 'Released', statuses: ['RELEASED', 'DONE'] },
];

/** Story level at which each phase counts as done. */
const DONE_LEVEL = { DEV: 2, TEST: 4, R4GOLIVE: 5, RELEASED: 6 } as const;

const LEVEL_BY_STATUS = new Map(STORY_PHASE_LEVELS.flatMap((entry) => entry.statuses.map((status) => [status, entry.level] as const)));

function normalizeStatus(status: string): string {
  return status.trim().toLocaleUpperCase('en-US').replace(/\s+/g, ' ');
}

/** Cancelled / Pending Stories are skipped by every phase rule. */
export function isSkippedStoryStatus(status: string): boolean {
  return /cancel/i.test(status) || /pending/i.test(status);
}

/** Level 0–6 of a Story status (unknown → 0); null for a skipped (Cancelled / Pending) Story. */
export function storyPhaseLevel(status: string): number | null {
  if (isSkippedStoryStatus(status)) return null;
  return LEVEL_BY_STATUS.get(normalizeStatus(status)) ?? 0;
}

/** Every counted (not skipped) Story is Released / Done — false when there is none. */
export function allStoriesReleased(storyStatuses: readonly string[]): boolean {
  const levels = storyStatuses.map(storyPhaseLevel).filter((level): level is number => level !== null);
  return levels.length > 0 && levels.every((level) => level >= DONE_LEVEL.RELEASED);
}

function normalizeIssueType(value: string): string {
  return value.toLocaleUpperCase('en-US').replace(/[^A-Z0-9]/g, '');
}

export interface StoryPhaseEvaluation {
  done: Record<TtmPhaseKey, boolean>;
  /** One-line explanation per phase for the cell tooltip; null when there is nothing to add. */
  notes: Record<TtmPhaseKey, string | null>;
}

const PERCENT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function evaluateStoryPhases(completion: EpicPhaseCompletionFacts, params: ScoringParameters): StoryPhaseEvaluation {
  const counted: { status: string; level: number }[] = [];
  let skippedPending = 0;
  const unknown = new Set<string>();
  for (const status of completion.storyStatuses) {
    const level = storyPhaseLevel(status);
    if (level === null) {
      if (/pending/i.test(status)) skippedPending += 1;
      continue;
    }
    if (!LEVEL_BY_STATUS.has(normalizeStatus(status))) unknown.add(normalizeStatus(status));
    counted.push({ status: normalizeStatus(status), level });
  }
  const total = counted.length;

  const ratios = params['phase.storyDoneRatio'];
  const tolerance = params['phase.storyDoneTolerance'];
  const reached = (minLevel: number, ratio: number) => {
    const doneCount = counted.filter((story) => story.level >= minLevel).length;
    const byRatio = total > 0 && doneCount / total >= ratio - 1e-9;
    const byTolerance = !byRatio && total >= tolerance.minStories && total - doneCount <= tolerance.maxRemaining;
    return { doneCount, isDone: byRatio || byTolerance, byTolerance };
  };

  // Pentest work = the Pentest subtasks (types `phase.pentestIssueTypes`) + the Epic's "Task PENTEST" (level 2,
  // key PENTEST-…, owner 2026-11-09) — both judged the same way: every one of them Done.
  const pentestTypes = new Set(params['phase.pentestIssueTypes'].map(normalizeIssueType));
  let pentestTotal = completion.pentestTasks?.total ?? 0;
  let pentestDone = completion.pentestTasks?.done ?? 0;
  for (const [issueType, counts] of Object.entries(completion.subtaskCountsByType)) {
    if (!pentestTypes.has(normalizeIssueType(issueType))) continue;
    pentestTotal += counts.total;
    pentestDone += counts.done;
  }
  const pentestSubtasksDone = pentestTotal > 0 && pentestDone === pentestTotal;

  const testReached = reached(DONE_LEVEL.TEST, ratios.TEST);
  const devReached = reached(DONE_LEVEL.DEV, ratios.DEV);
  const test = pentestSubtasksDone || testReached.isDone;
  const dev = test || devReached.isDone;
  const pentest = pentestTotal > 0 ? pentestSubtasksDone : test;
  const r4golive = completion.r4goliveRecorded || (total > 0 && counted.every((story) => story.level >= DONE_LEVEL.R4GOLIVE));

  const extras = [
    skippedPending > 0 ? `bỏ qua ${skippedPending} story Pending` : null,
    unknown.size > 0 ? `status chưa phân loại (tính là chưa vào DEV): ${[...unknown].join(', ')}` : null,
  ].filter(Boolean);
  const behind = (minLevel: number) => {
    const counts = new Map<string, number>();
    for (const story of counted) if (story.level < minLevel) counts.set(story.status, (counts.get(story.status) ?? 0) + 1);
    return [...counts].map(([status, count]) => `${count} ${status}`).join(', ');
  };
  const storyNote = (phase: 'DEV' | 'TEST', minLevel: number, result: { doneCount: number; byTolerance: boolean }, ratio: number) => {
    if (total === 0) return [`${phase}: không có story để xét (đã bỏ qua Cancelled/Pending)`, ...extras].join(' · ');
    const remaining = behind(minLevel);
    return [
      `${phase}: ${result.doneCount}/${total} story đã xong ${phase} (${PERCENT.format((result.doneCount / total) * 100)}%, ngưỡng ${PERCENT.format(ratio * 100)}%)`,
      result.byTolerance ? `đạt nhờ dung sai: Epic ≥ ${tolerance.minStories} story, còn tối đa ${tolerance.maxRemaining} story chưa xong` : null,
      remaining ? `chưa xong: ${remaining}` : null,
      ...extras,
    ].filter(Boolean).join(' · ');
  };
  const viaPentest = `Hoàn thành theo Pentest — subtask / Task PENTEST (${pentestDone}/${pentestTotal} Done)`;

  return {
    done: { DESIGN: completion.designDone, DEV: dev, TEST: test, PENTEST: pentest, R4GOLIVE: r4golive },
    notes: {
      DESIGN: null,
      DEV: pentestSubtasksDone ? viaPentest : !devReached.isDone && test ? 'Hoàn thành vì pha TEST đã xong' : storyNote('DEV', DONE_LEVEL.DEV, devReached, ratios.DEV),
      TEST: pentestSubtasksDone ? viaPentest : storyNote('TEST', DONE_LEVEL.TEST, testReached, ratios.TEST),
      PENTEST: pentestTotal > 0 ? `Pentest (subtask / Task PENTEST): ${pentestDone}/${pentestTotal} Done` : 'Không có subtask / Task PENTEST — hoàn thành cùng pha TEST',
      R4GOLIVE: null,
    },
  };
}
