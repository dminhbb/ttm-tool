import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { EPIC_ANOMALY_RULE_INDEX } from '@/lib/epic-data-anomaly';
import { BADGE_BY_ID, type BadgeId } from '@/lib/scoring/catalog';
import { extraRecommendations, findingOf, hasReleaseStatusMismatch, isTtmCnttAchieved, isTtmE2eAchieved, isWaitingGolive, ttmFailKind } from '@/lib/epic-row-verdicts';

/**
 * "Nhận xét" column of Quản trị Epic, condensed (owner 2026-10-16): the TTM-CNTT headline badge
 * (Fail / Đạt / Ngoài phạm vi) stays as it is; every verdict of the cell — headline included — is also
 * listed in one of four groups shown as icon chips (EpicCommentCell):
 *   RESULT       Kết quả          Fail / Đạt TTM-CNTT (QLDA), Fail / Đạt TTM-E2E
 *   DATA_ANOMALY Sai lệch dữ liệu one item per violated rule
 *   WARNING      Cảnh báo         Cảnh báo muộn/sớm, Sai Status, Chờ golive, Giải trình Golive, Pending lâu
 *   ACTION       Xử lý            Thiếu lý do / phòng chịu TN chính, the other recommendations
 * Empty groups are left out. Pure — the same verdict rules as the old badge list, regrouped.
 */

export type CommentTone = 'action' | 'danger' | 'success' | 'warning';
export type CommentGroupKey = 'ACTION' | 'DATA_ANOMALY' | 'RESULT' | 'WARNING';

export interface CommentItem {
  key: string;
  label: string;
  message: string;
  tone: CommentTone;
}

export interface CommentGroup {
  items: CommentItem[];
  key: CommentGroupKey;
  label: string;
  /** Worst tone inside the group — colors the chip icon. */
  tone: CommentTone;
}

/** The badge that stays outside the chips (TTM-CNTT verdict). */
export interface CommentHeadline {
  kind: 'ACHIEVED' | 'FAIL' | 'OUT_OF_SCOPE';
  label: string;
  message: string | null;
}

export interface EpicCommentSummary {
  groups: CommentGroup[];
  headline: CommentHeadline | null;
}

export const COMMENT_GROUP_LABEL: Record<CommentGroupKey, string> = {
  ACTION: 'Xử lý',
  RESULT: 'Kết quả',
  WARNING: 'Cảnh báo',
  DATA_ANOMALY: 'Sai lệch dữ liệu',
};

/** 1x4 table order: Kết quả (Xanh lá/Orange nếu fail), Xử lý (Xanh dương), Cảnh báo (Tím), Sai lệch dữ liệu (Hồng nhạt/Orange nếu có). */
export const GROUP_ORDER: readonly CommentGroupKey[] = ['RESULT', 'ACTION', 'WARNING', 'DATA_ANOMALY'];

export const GROUP_COLOR_CLASS: Record<CommentGroupKey, string> = {
  ACTION: 'ttm-comment-cell-action',
  RESULT: 'ttm-comment-cell-result',
  WARNING: 'ttm-comment-cell-warning',
  DATA_ANOMALY: 'ttm-comment-cell-anomaly',
};

function formatViDate(value: string | null): string {
  if (!value) return '-';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function groupTone(key: CommentGroupKey, items: readonly CommentItem[]): CommentTone {
  if (key === 'DATA_ANOMALY') return 'danger';
  if (key === 'ACTION') return 'action';
  if (items.some((item) => item.tone === 'danger')) return 'danger';
  return key === 'RESULT' ? 'success' : 'warning';
}

/** "R1 — Thiếu Start Date": the rule's title from the scoring catalog, for a violation of the row. */
function violationTitle(ruleIndex: number): string {
  const badgeId: BadgeId | undefined = ruleIndex === 7
    ? 'RELEASE_STATUS_MISMATCH'
    : (Array.from(BADGE_BY_ID.keys()).find((id) => id.startsWith(`ANOMALY_R${ruleIndex}_`)));
  const label = badgeId ? BADGE_BY_ID.get(badgeId)?.label : undefined;
  return label ? `R${ruleIndex} — ${label}` : `R${ruleIndex}`;
}

export function summarizeEpicComments(row: EpicAlertRowPhased): EpicCommentSummary {
  const buckets: Record<CommentGroupKey, CommentItem[]> = { ACTION: [], DATA_ANOMALY: [], RESULT: [], WARNING: [] };
  const add = (group: CommentGroupKey, item: CommentItem) => { buckets[group].push(item); };
  let headline: CommentHeadline | null = null;

  // ---- TTM-CNTT (QLDA): same precedence as the old badge list — scope, then Sai Status, Fail, Late, Early, Đạt.
  const cnttAchieved = isTtmCnttAchieved(row);
  if (!row.ttmCnttInScope) {
    headline = {
      kind: 'OUT_OF_SCOPE',
      label: 'Ngoài phạm vi TTM-CNTT (QLDA)',
      message: "Epic nằm ngoài phạm vi dữ liệu TTM-CNTT (QLDA) đang cấu hình (R4G Date/baseline nằm ngoài khoảng ngày thiết lập tại 'Cấu hình cảnh báo').",
    };
  } else {
    if (row.ttmCnttStatusMismatch) {
      add('WARNING', {
        key: 'CNTT_STATUS_MISMATCH', label: 'Sai Status', tone: 'warning',
        message: 'R4G Date đã ghi nhận và đúng hạn theo TTM-CNTT (QLDA), nhưng status Epic chưa chuyển sang R4GOLIVE — vui lòng cập nhật status đúng quy định.',
      });
    } else if (row.alertLevel === 'FAIL') {
      const message = ttmFailKind(row) === 'MISSING_R4G'
        ? 'Chưa có R4G Date và đã quá Target TTM-CNTT (QLDA).'
        : 'R4G Date muộn hơn Target TTM-CNTT (QLDA).';
      headline = { kind: 'FAIL', label: 'Fail TTM-CNTT (QLDA)', message };
      add('RESULT', { key: 'CNTT_FAIL', label: 'Fail TTM-CNTT (QLDA)', message, tone: 'danger' });
    } else if (row.alertLevel === 'LATE') {
      add('WARNING', { key: 'CNTT_LATE', label: 'Cảnh báo muộn', message: 'Chưa có R4G Date, đã qua mốc cảnh báo muộn của status hiện tại, chưa quá Target TTM-CNTT (QLDA).', tone: 'warning' });
    } else if (row.alertLevel === 'EARLY') {
      add('WARNING', { key: 'CNTT_EARLY', label: 'Cảnh báo sớm', message: 'Đã qua mốc cảnh báo sớm của status hiện tại, chưa có R4G Date.', tone: 'warning' });
    }
    // "Sai Status" doesn't take the pass away (Scoring Service, 2026-10-01): both can show.
    if (cnttAchieved && row.alertLevel === 'NONE') {
      const message = 'Epic hoàn thành TTM-CNTT (QLDA) đúng hạn theo rule.';
      headline = { kind: 'ACHIEVED', label: 'Đạt TTM-CNTT (QLDA)', message };
      add('RESULT', { key: 'CNTT_PASS', label: 'Đạt TTM-CNTT (QLDA)', message, tone: 'success' });
    }
  }

  // ---- TTM-E2E
  if (row.ttmE2eAlertLevel === 'FAIL') {
    add('RESULT', { key: 'E2E_FAIL', label: 'Fail TTM-E2E', message: 'Đã vượt ngân sách TTM-E2E.', tone: 'danger' });
  } else if (isTtmE2eAchieved(row)) {
    // Scoring Service: its own finding (no Released requirement since 2026-10-01); the legacy engine still requires Released.
    add('RESULT', { key: 'E2E_PASS', label: 'Đạt TTM-E2E', message: findingOf(row, 'E2E_PASS')?.message ?? 'Epic hoàn thành TTM-E2E đúng hạn theo rule (T0 → R4G Date) và đã Released.', tone: 'success' });
  }

  // ---- Release axis
  if (isWaitingGolive(row)) {
    add('WARNING', {
      key: 'RELEASE_WAITING_GOLIVE', label: 'Chờ golive', tone: 'warning',
      message: findingOf(row, 'RELEASE_WAITING_GOLIVE')?.message
        ?? `Epic đã có R4G Date, còn trong hạn ${formatViDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) và chưa có Due Date.`,
    });
  }
  if (row.releaseAxisState === 'EARLY_WARNING') {
    add('WARNING', { key: 'RELEASE_EARLY', label: 'Cảnh báo sớm (Release)', message: `Đã qua R4GOLIVE, còn trong hạn ${formatViDate(row.releaseGraceDeadline)} để có Due Date hợp lệ và chuyển status Released.`, tone: 'warning' });
  } else if (row.releaseAxisState === 'JUSTIFY_GOLIVE') {
    add('WARNING', { key: 'RELEASE_JUSTIFY_GOLIVE', label: 'Giải trình Golive', message: `Đã quá hạn ${formatViDate(row.releaseGraceDeadline)} (R4G Date + 5 ngày làm việc) mà Epic chưa Released đúng hạn hoặc Due Date vượt hạn — cần giải trình.`, tone: 'danger' });
  }

  // ---- Scoring Service only (display engine 'scoring')
  if (row.scoringBadges) {
    const releaseMismatch = hasReleaseStatusMismatch(row) ? findingOf(row, 'RELEASE_STATUS_MISMATCH') : null;
    if (releaseMismatch) add('WARNING', { key: 'RELEASE_STATUS_MISMATCH', label: 'Sai Status (Release)', message: releaseMismatch.message, tone: 'warning' });
    // Same cause as the TTM-CNTT "Sai Status": only listed when that one isn't already.
    const e2eMismatch = row.ttmCnttInScope && row.ttmCnttStatusMismatch ? null : findingOf(row, 'E2E_STATUS_MISMATCH');
    if (e2eMismatch) add('WARNING', { key: 'E2E_STATUS_MISMATCH', label: 'Sai Status (TTM-E2E)', message: e2eMismatch.message, tone: 'warning' });
    const pending = findingOf(row, 'ANOMALY_R2_PENDING_TOO_LONG');
    if (pending) add('WARNING', { key: 'ANOMALY_R2_PENDING_TOO_LONG', label: 'Pending lâu', message: pending.message, tone: 'warning' });

    const missingFailReason = findingOf(row, 'REC_MISSING_FAIL_REASON');
    if (missingFailReason) add('ACTION', { key: 'REC_MISSING_FAIL_REASON', label: 'Thiếu lý do Fail TTM', message: missingFailReason.message, tone: 'action' });
    const missingDepartment = findingOf(row, 'REC_MISSING_RESPONSIBLE_DEPARTMENT');
    if (missingDepartment) add('ACTION', { key: 'REC_MISSING_RESPONSIBLE_DEPARTMENT', label: 'Thiếu phòng chịu TN chính', message: missingDepartment.message, tone: 'action' });
    for (const item of extraRecommendations(row)) {
      add('ACTION', { key: item.badge, label: BADGE_BY_ID.get(item.badge)?.label ?? item.badge, message: item.message, tone: 'action' });
    }
  }

  // ---- Sai lệch dữ liệu: one item per violated rule
  if (row.hasDataAnomaly) {
    for (const violation of row.dataAnomalyViolations ?? []) {
      add('DATA_ANOMALY', { key: `${violation.code}:${violation.message}`, label: violationTitle(violation.ruleIndex ?? EPIC_ANOMALY_RULE_INDEX[violation.code]), message: violation.message, tone: 'danger' });
    }
  }

  const groups = GROUP_ORDER.map((key): CommentGroup => ({
    items: buckets[key],
    key,
    label: COMMENT_GROUP_LABEL[key],
    tone: groupTone(key, buckets[key]),
  }));
  return { groups, headline };
}

export interface CommentBadgeItem {
  colorClass: string;
  groupKey: CommentGroupKey | 'OUT_OF_SCOPE';
  key: string;
  label: string;
  message: string;
  tone: CommentTone | 'neutral';
}

function resolveBadgeColorClass(groupKey: CommentGroupKey | 'OUT_OF_SCOPE', tone: CommentTone | 'neutral'): string {
  if (groupKey === 'OUT_OF_SCOPE') return 'ttm-comment-badge-out-of-scope';
  if (groupKey === 'RESULT' && tone === 'danger') return 'ttm-comment-cell-orange';
  if (groupKey === 'DATA_ANOMALY') return 'ttm-comment-cell-orange';
  return GROUP_COLOR_CLASS[groupKey];
}

/**
 * Ghép các badge vào dòng theo First-Fit để giảm số dòng trong chiều rộng cột "Nhận xét" mà KHÔNG đảo thứ tự ưu tiên
 * giữa các nhóm (Kết quả → Xử lý → Cảnh báo → Sai lệch dữ liệu): một badge chỉ được xếp vào dòng không sớm hơn dòng
 * đang chứa badge cuối cùng của nhóm đứng trước nó, nên chỉ các badge cùng nhóm mới có thể đổi chỗ cho nhau.
 */
export function packCommentBadges(
  badges: readonly CommentBadgeItem[],
  maxRowUnits = 34,
): CommentBadgeItem[] {
  if (badges.length <= 2) return [...badges];
  const lines: { items: CommentBadgeItem[]; used: number }[] = [];
  /** Highest line index holding a badge of a group that comes before the one being placed. */
  let floorLine = 0;
  /** Highest line index used so far by the group being placed. */
  let groupLine = 0;
  let currentGroup: CommentBadgeItem['groupKey'] | null = null;
  for (const badge of badges) {
    if (badge.groupKey !== currentGroup) {
      floorLine = Math.max(floorLine, groupLine);
      groupLine = floorLine;
      currentGroup = badge.groupKey;
    }
    const unitCost = Math.min(maxRowUnits, badge.label.length + 3);
    let target = -1;
    for (let index = floorLine; index < lines.length; index += 1) {
      if (lines[index].used + unitCost <= maxRowUnits) {
        target = index;
        break;
      }
    }
    if (target === -1) {
      lines.push({ items: [], used: 0 });
      target = lines.length - 1;
    }
    lines[target].items.push(badge);
    lines[target].used += unitCost;
    groupLine = Math.max(groupLine, target);
  }
  return lines.flatMap((line) => line.items);
}

/**
 * Danh sách tất cả các badge của Epic cho chế độ hiển thị "Liệt kê" ('list') tại cột "Nhận xét",
 * sử dụng cùng bảng màu nền theo nhóm như thiết kế "Tối giản" ('minimal') và được sắp xếp thông minh
 * để ít xuống dòng.
 */
export function listEpicCommentBadges(row: EpicAlertRowPhased, maxRowUnits = 34): CommentBadgeItem[] {
  const { groups, headline } = summarizeEpicComments(row);
  const rawBadges: CommentBadgeItem[] = [];

  if (headline?.kind === 'OUT_OF_SCOPE') {
    rawBadges.push({
      key: 'OUT_OF_SCOPE',
      label: headline.label,
      message: headline.message ?? headline.label,
      groupKey: 'OUT_OF_SCOPE',
      tone: 'neutral',
      colorClass: resolveBadgeColorClass('OUT_OF_SCOPE', 'neutral'),
    });
  }

  for (const group of groups) {
    for (const item of group.items) {
      // Bỏ badge Fail/Đạt TTM-CNTT (QLDA) trong chế độ "Liệt kê" vì đã hiển thị riêng tại cột PASS (owner 2026-10-26).
      if (item.key === 'CNTT_FAIL' || item.key === 'CNTT_PASS') continue;
      rawBadges.push({
        key: item.key,
        label: item.label,
        message: item.message,
        groupKey: group.key,
        tone: item.tone,
        colorClass: resolveBadgeColorClass(group.key, item.tone),
      });
    }
  }

  return packCommentBadges(rawBadges, maxRowUnits);
}
