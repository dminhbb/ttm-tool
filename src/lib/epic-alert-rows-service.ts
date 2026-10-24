import 'server-only';
import { applyTtmExclusions, loadTtmExclusionSources } from '@/lib/black-listed-epic-service';
import { fetchEpicAlertContext, missingStandardInfo } from '@/lib/epic-alert-service';
import type { EpicAlertEntry, EpicAlertFilters } from '@/lib/epic-alert-service';
import type { EpicAlertPhasedResponse, EpicAlertRowPhased, PhaseCell } from '@/lib/epic-alert-types';
import { applyPmSmAssignments } from '@/lib/epic-pm-sm-assignment';
import { loadPmSmNarrowings } from '@/lib/epic-pm-sm-assignment-service';
import { cnttGeometry, e2eGeometry, elapsedWorkingDays, resolveTtmActualRange } from '@/lib/epic-row-geometry';
import type { UserRole } from '@/lib/auth-types';
import { loadScoringContext, vnToday } from '@/lib/scoring-context-service';
import { loadEpicFacts } from '@/lib/scoring-facts-service';
import { toIsoDate } from '@/lib/scoring/dates';
import { projectRows } from '@/lib/scoring/projection';
import { scoreEpic } from '@/lib/scoring/score-epic';
import type { EpicScorecard, ScoringContext, ScoringScopeConfig } from '@/lib/scoring/types';

/** EpicAlertFilters' "Phạm vi dữ liệu cho TTM" deep-link override → ScoringContext override
 * (undefined per field = admin default, null/'' = explicit "no bound"). */
function scopeOverrideOf(filters: EpicAlertFilters): Partial<ScoringScopeConfig> {
  const pick = (value: string | null | undefined) => (value === undefined ? undefined : value || null);
  return {
    cnttFrom: pick(filters.ttmScopeCnttFrom),
    cnttTo: pick(filters.ttmScopeCnttTo),
    qaFrom: pick(filters.ttmScopeQaFrom),
    qaTo: pick(filters.ttmScopeQaTo),
  };
}

function naPhaseCell(): PhaseCell {
  return { alertLevel: 'NONE', baselineDate: null, baselineSourceDate: null, baselineSourceLabel: null, isCurrentStage: false, isDone: false };
}

/**
 * One Epic's row before its verdicts: names, dates, the stripes' numbers, the Release cell. Every
 * verdict field is a neutral placeholder here — projectRows (scoring/projection.ts) overwrites them
 * from the Epic's scorecard, which also supplies the numbers drawn here (budgets, target dates, phase
 * baselines), so a row can never disagree with its own scorecard.
 */
function buildBaseRow(entry: EpicAlertEntry, card: EpicScorecard, releasedDone: boolean, ctx: ScoringContext): EpicAlertRowPhased {
  const { row } = entry;
  const derived = card.derived;
  const cntt = cnttGeometry(entry.complexity, derived, ctx);
  const e2e = e2eGeometry(derived, ctx);
  const actualRange = resolveTtmActualRange(row, ctx.asOf);

  const release: PhaseCell = {
    alertLevel: 'NONE',
    baselineDate: e2e.baselineDate,
    baselineSourceDate: e2e.baselineSourceDate,
    baselineSourceLabel: e2e.baselineSourceLabel,
    isCurrentStage: false,
    isDone: releasedDone,
  };

  return {
    alertLevel: 'NONE',
    components: row.components,
    currentStatus: row.status,
    dataLayerDate: row.aggregatedAt ?? null,
    domainName: entry.domain,
    dueDate: row.dueDate,
    epicKey: row.epicKey,
    epicName: row.epicName,
    epicType: entry.complexity,
    hasAlertHistory: entry.hasAlertHistory,
    hasDataAnomaly: false,
    dataAnomalyViolations: [],
    // "Thiếu T0" & "Thiếu Start Date" aren't shown on the Epic screens (the Sai lệch dữ liệu badges own them).
    missingStandardInfo: missingStandardInfo(row).filter((item) => item !== 'T0' && item !== 'Start Date'),
    // PM/SM of the Epic's project (comma-joined if several) — not the raw Jira assignee.
    ownerName: entry.pmSmName,
    projectKey: row.project ?? '',
    projectName: entry.projectName || row.project || '',
    r4gDate: row.r4gDate,
    releaseAxisState: 'NONE',
    releaseGraceDeadline: derived.releaseGraceDeadline,
    remainingWorkingDays: derived.cnttRemainingWorkingDays,
    requestingUnit: row.requestingUnit,
    requirementLevel: row.requirementLevel,
    sourceType: 'CSV',
    stages: { design: naPhaseCell(), dev: naPhaseCell(), pentest: naPhaseCell(), r4golive: naPhaseCell(), release, test: naPhaseCell() },
    t0IdeaApprovedDate: row.ideaApprovedDate,
    t1StartDate: row.startDate,
    targetR4gDate: derived.cnttTargetDate ?? row.targetR4gDate,
    ttmCnttInScope: true,
    qaInScope: true,
    ttmE2eAlertLevel: 'NONE',
    ttmActualElapsedWorkingDays: elapsedWorkingDays(actualRange.fromDate, actualRange.toDate, ctx),
    ttmActualFromDate: actualRange.fromDate,
    ttmActualToDate: actualRange.toDate,
    ttmCnttElapsedWorkingDays: cntt.elapsedWorkingDays,
    ttmCnttFromDate: cntt.fromDate,
    ttmCnttFromField: cntt.fromField,
    ttmCnttTargetWorkingDays: cntt.targetWorkingDays,
    ttmCnttToField: cntt.toField,
    ttmE2eActualToDate: e2e.actualToDate,
    ttmE2eElapsedWorkingDays: e2e.elapsedWorkingDays,
    ttmE2eTargetWorkingDays: e2e.targetWorkingDays,
    ttmCnttStatusMismatch: false,
  };
}

const ALERT_RANK = { FAIL: 0, LATE: 1, EARLY: 2, NONE: 3 } as const;

/** Data-anomaly Epics sink to the bottom (grouped together so someone cleaning up the source Jira data
 * finds them all in one place); then by alert level; then by how few working days remain. */
function compareRows(a: EpicAlertRowPhased, b: EpicAlertRowPhased): number {
  if (a.hasDataAnomaly !== b.hasDataAnomaly) return a.hasDataAnomaly ? 1 : -1;
  const rankDiff = ALERT_RANK[a.alertLevel] - ALERT_RANK[b.alertLevel];
  if (rankDiff !== 0) return rankDiff;
  return (a.remainingWorkingDays ?? Infinity) - (b.remainingWorkingDays ?? Infinity);
}

export interface EpicAlertRowsWithScorecards {
  response: EpicAlertPhasedResponse;
  /** The scorecard behind each returned row, keyed by Epic key. */
  scorecards: Map<string, EpicScorecard>;
}

/**
 * The Epic row set every screen displays, plus the scorecards behind it. The access scope, visibility and
 * filters come from fetchEpicAlertContext; each Epic is then scored by the Epic Scoring Service at the
 * requested as-of date / data layer(s) and its row is laid out from that scorecard. Used directly by the
 * cache rebuild (which needs the scorecards for the import timeline too); screens call
 * getEpicAlertRowsForDisplay.
 */
export async function getEpicAlertRowsWithScorecards(userId: number, role: UserRole, filters: EpicAlertFilters = {}): Promise<EpicAlertRowsWithScorecards> {
  const context = await fetchEpicAlertContext(userId, role, filters);
  // Viewing a past "Chọn lớp dữ liệu" layer judges everything as of THAT layer's date, not today.
  const asOfDate = toIsoDate(filters.asOfDate);
  const empty = (): EpicAlertRowsWithScorecards => ({
    response: { accessRole: context.accessRole, asOfDate, availableLayerDates: context.availableLayerDates, lastAggregatedAt: context.lastAggregatedAt, rows: [], viewerName: context.viewerName },
    scorecards: new Map(),
  });
  if (!context.lastAggregatedAt || !context.entries.length) return empty();

  const asOf = asOfDate ?? vnToday();
  const [ctx, facts, exclusionSources, pmSmNarrowings] = await Promise.all([
    loadScoringContext(asOf, scopeOverrideOf(filters)),
    loadEpicFacts(asOf, { layerDates: filters.layerDates }),
    loadTtmExclusionSources(),
    loadPmSmNarrowings(),
  ]);
  const factsByKey = new Map(facts.map((item) => [item.epicKey, item]));

  const scorecards = new Map<string, EpicScorecard>();
  const baseRows: EpicAlertRowPhased[] = [];
  for (const entry of context.entries) {
    const epicFacts = factsByKey.get(entry.row.epicKey);
    if (!epicFacts) continue;
    const card = scoreEpic(epicFacts, ctx);
    scorecards.set(entry.row.epicKey, card);
    baseRows.push(buildBaseRow(entry, card, epicFacts.phaseCompletion?.releasedDone ?? false, ctx));
  }

  // "Epic ngoại lệ" / project Time to Market = N are stamped on so every screen can show the black dot
  // and skip the Epic in TTM; PM/SM names are narrowed to the ones responsible for each Epic's components.
  const stamped = applyPmSmAssignments(applyTtmExclusions(baseRows, exclusionSources), pmSmNarrowings);
  const rows = projectRows(stamped, scorecards).sort(compareRows);

  return {
    response: { accessRole: context.accessRole, asOfDate, availableLayerDates: context.availableLayerDates, lastAggregatedAt: context.lastAggregatedAt, rows, viewerName: context.viewerName },
    scorecards,
  };
}

/** Use this from any screen/API that needs Epic rows (never the cache tables directly, unless paging in SQL). */
export async function getEpicAlertRowsForDisplay(userId: number, role: UserRole, filters: EpicAlertFilters = {}): Promise<EpicAlertPhasedResponse> {
  return (await getEpicAlertRowsWithScorecards(userId, role, filters)).response;
}
