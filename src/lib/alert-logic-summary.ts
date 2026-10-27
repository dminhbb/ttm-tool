import { BADGE_LIST, FINDING_GROUPS, INDEX_MEMBERSHIP_RULES, INDEX_PERCENT_FORMULA, SCORING_AXES, SUPPRESSIONS } from '@/lib/scoring/catalog';
import type { RuleGroupSummaryItem } from '@/lib/rule-group-config';
import { buildRuleCatalog } from '@/lib/scoring/rule-catalog';
import { RULE_CATEGORY_LABELS, RULE_CATEGORY_ORDER, RULE_SLOT_LABELS } from '@/lib/scoring/rule-labels';

/**
 * The content of the "Logic cảnh báo Epic — Scoring Service" popup (HelpPanels.tsx AlertLogicModal) as data, for the MCP
 * tool get_alert_logic. Everything that is a table in the popup is read from the same modules the popup (and the Scoring
 * Service) use — the badge catalog, the rule registry, the Rule Groups in force — so the answer can't drift from the
 * screen. The short prose of sections 1 and 4 is repeated here as text; the dated change history (section 8) is not:
 * it lives in the Tài liệu sản phẩm (search_product_docs).
 */

export const ALERT_LOGIC_SECTIONS = ['nguyenTac', 'kyHieu', 'findingGroups', 'badges', 'suppressions', 'chiSo', 'ruleObjects', 'nhomRule'] as const;
export type AlertLogicSection = (typeof ALERT_LOGIC_SECTIONS)[number];

const PRINCIPLES = [
  'Mọi rule nằm trong 1 Scoring Service duy nhất. Đầu vào là dữ liệu 1 Epic và mốc asOf; đầu ra là danh sách finding, mỗi finding gắn đúng 1 badge.',
  'Mỗi badge thuộc đúng 1 Axis và đúng 1 Finding Group. Một Epic có thể có nhiều badge cùng lúc trên nhiều axis; màn hình tự chọn badge cần hiển thị.',
  'asOf là mốc "hôm nay" theo giờ Việt Nam: bằng hôm nay khi xem hiện tại, bằng ngày của lớp dữ liệu khi xem quá khứ. Dữ liệu Epic và story/subtask đều lấy tại asOf.',
  'Tham số (offset, thời hạn grace, khoảng ngày, tỉ lệ…) lấy từ cấu hình trong DB; logic nằm trong code dưới dạng các Rule object. Rule nào chấm Epic nào do nhóm rule quyết định (SUPERADMIN cấu hình ở Rule Management).',
  'Epic được chấm theo mọi nhóm rule bật mà nó khớp điều kiện (ngày, và TTM-applied nếu nhóm có), từ ưu tiên cao xuống thấp, cuối cùng là Default; với mỗi rule (slot), nhóm gần nhất khai báo rule đó (Bật / Tắt) quyết định, rule không khai báo là Kế thừa từ nhóm dưới.',
  'Cache chỉ tự tạo lại khi import file CSV (thủ công hoặc qua API) và lượt đầu tiên mỗi ngày; các thay đổi cấu hình khác chỉ có hiệu lực sau khi SUPERADMIN bấm "Tạo lại cache".',
];

const NOTATION = [
  'T0 = Idea Approved Date (trống thì dùng ngày tạo Epic trên Jira) · T1 = Start Date · R4G = R4G Date · Due = Due Date.',
  'X +wd n = cộng n ngày làm việc (bỏ Thứ Bảy, Chủ Nhật, ngày nghỉ; tính cả ngày làm bù) · WD(a, b) = số ngày làm việc từ a tới b.',
  'N_CNTT, N_E2E = ngân sách ngày làm việc theo "Tiêu chí Time to Market" của loại Epic (theo bộ ngân sách của rule TTM-CNTT áp dụng cho Epic) · Target_CNTT = T1 +wd (N_CNTT − 1) (Start Date là ngày 1; với Epic "Ngoại lệ" dùng rule Kế hoạch ngoại lệ TTM thì Target_CNTT là ngày except-TTM-plan) · Target_E2E = T0 +wd (N_E2E − 1).',
  'G = thời hạn grace của trục Release (mặc định 5 ngày làm việc) · Mốc cảnh báo muộn = T1 +wd ⌈% × N_CNTT⌉ với % theo loại Epic × status ("Cấu hình cảnh báo").',
  'Thứ tự workflow: TO DO → IN PO → DESIGN → DEV → TEST → PENTEST → R4GOLIVE → MVP DONE → PILOT → DONE → RELEASED. Pending / Reopened ngang hàng DEV (In Progress).',
];

const labelOfGroup = (id: string) => FINDING_GROUPS.find((group) => group.id === id)?.label ?? id;
const labelOfAxis = (id: string) => SCORING_AXES.find((axis) => axis.id === id)?.label ?? id;
const labelOfBadge = (id: string) => BADGE_LIST.find((badge) => badge.id === id)?.label ?? id;

export interface AlertLogicOptions {
  /** Only these badge ids (section badges); default every badge. */
  badgeIds?: readonly string[];
  /** Rule Groups in force (RuleGroupSummaryItem[], rule-group-summary.ts) — section nhomRule. */
  ruleGroups: readonly RuleGroupSummaryItem[];
  /** Sections to return; default all. */
  sections?: readonly AlertLogicSection[];
}

export function buildAlertLogicSummary({ badgeIds, ruleGroups, sections }: AlertLogicOptions) {
  const want = new Set<AlertLogicSection>(sections?.length ? sections : ALERT_LOGIC_SECTIONS);
  const catalog = buildRuleCatalog();
  const nameOfRule = new Map(catalog.map((rule) => [rule.id, rule.name]));
  const selectable = catalog.filter((rule) => !rule.core);
  const pickedBadges = new Set(badgeIds ?? []);

  return {
    screen: 'Popup "Logic cảnh báo Epic — Scoring Service" (menu người dùng)',
    ...(want.has('nguyenTac') ? { nguyenTac: PRINCIPLES } : {}),
    ...(want.has('kyHieu') ? { kyHieu: NOTATION } : {}),
    ...(want.has('findingGroups') ? {
      findingGroups: FINDING_GROUPS.map((group) => ({ id: group.id, label: group.label, moTa: group.description })),
      axes: SCORING_AXES.map((axis) => ({ id: axis.id, label: axis.label, moTa: axis.description })),
    } : {}),
    ...(want.has('badges') ? {
      badges: BADGE_LIST
        .filter((badge) => pickedBadges.size === 0 || pickedBadges.has(badge.id))
        .map((badge) => ({
          id: badge.id,
          label: badge.label,
          axis: labelOfAxis(badge.axis),
          group: labelOfGroup(badge.group),
          macDinhBat: badge.defaultEnabled,
          uuTien: badge.precedence,
          yNghia: badge.meaning,
          congThuc: badge.formula,
        })),
    } : {}),
    ...(want.has('suppressions') ? {
      badgeBiChe: SUPPRESSIONS.map((rule) => ({
        khiCoBadge: { id: rule.when, label: labelOfBadge(rule.when), axis: labelOfAxis(BADGE_LIST.find((badge) => badge.id === rule.when)?.axis ?? '') },
        thiCheCacBadge: rule.suppress.map((id) => ({ id, label: labelOfBadge(id) })),
      })),
      ghiChu: 'Badge bị che vẫn được trả về để tra cứu nhưng màn hình mặc định không hiển thị.',
    } : {}),
    ...(want.has('chiSo') ? {
      chiSo: {
        dieuKienCo: INDEX_MEMBERSHIP_RULES.map((rule) => ({ chiSo: rule.index, co: rule.flag, dieuKien: rule.formula })),
        congThucTyLe: INDEX_PERCENT_FORMULA,
      },
    } : {}),
    ...(want.has('ruleObjects') ? {
      ruleObjects: RULE_CATEGORY_ORDER.flatMap((category) => catalog.filter((rule) => rule.category === category).map((rule) => ({
        id: rule.id,
        ten: rule.name,
        nhom: RULE_CATEGORY_LABELS[category],
        loai: rule.core ? 'Luôn chạy' : rule.slot ? `Đánh giá ${RULE_SLOT_LABELS[rule.slot]}` : 'Chọn theo nhóm',
        slot: rule.slot ? RULE_SLOT_LABELS[rule.slot] : null,
        tomTat: rule.summary,
        dieuKienApDung: rule.conditions,
        canRuleDanhGia: rule.requires.map((slot) => RULE_SLOT_LABELS[slot]),
        macDinhTrongDefault: rule.defaultSelected,
        badge: rule.emits.map((badge) => badge.label),
      }))),
    } : {}),
    ...(want.has('nhomRule') ? {
      nhomRuleDangApDung: {
        cachChon: 'Epic được chấm theo mọi nhóm bật mà nó khớp điều kiện, ưu tiên 1 → cao nhất, Default cuối cùng; nhóm gần nhất khai báo một rule (Bật/Tắt) quyết định rule đó; rule không khai báo là Kế thừa.',
        nhom: ruleGroups.map((group) => ({
          ten: group.name,
          macDinh: group.isDefault,
          dangBat: group.enabled,
          uuTien: group.priority,
          dieuKien: group.conditions,
          batRule: group.ruleIds.map((id) => nameOfRule.get(id) ?? id),
          tatRule: (group.offRuleIds ?? []).map((id) => nameOfRule.get(id) ?? id),
          // Default has no Tắt state: a rule it does not turn on simply does not apply.
          khongBatTrongDefault: group.isDefault ? selectable.filter((rule) => !group.ruleIds.includes(rule.id)).map((rule) => rule.name) : [],
        })),
      },
    } : {}),
    lichSuThayDoiLogic: 'Mục 8 của popup (thay đổi logic theo ngày) nằm trong Tài liệu sản phẩm — dùng search_product_docs / get_product_doc_section.',
  };
}
