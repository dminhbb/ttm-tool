'use client';

import { useEffect, useRef, useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ModalContentSearch } from '@/components/ui/ModalContentSearch';
import { BADGE_LIST, FINDING_GROUPS, INDEX_MEMBERSHIP_RULES, INDEX_PERCENT_FORMULA, SCORING_AXES, SUPPRESSIONS, badgesOf } from '@/lib/scoring/catalog';
import type { BadgeDefinition, FindingGroup } from '@/lib/scoring/catalog';
import type { RuleGroupSummaryItem } from '@/lib/rule-group-config';
import { buildRuleCatalog } from '@/lib/scoring/rule-catalog';
import { RULE_CATEGORY_LABELS, RULE_CATEGORY_ORDER, RULE_SLOT_LABELS } from '@/lib/scoring/rule-labels';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const GROUP_TONE: Record<FindingGroup, string> = {
  FAIL: 'bg-status-danger-soft text-status-danger border-status-danger/30',
  ALERT: 'bg-status-warning-soft text-status-warning border-status-warning/30',
  RECOMMENDATION: 'bg-[rgb(124_58_237/0.12)] text-[var(--color-accent-500)] border-[var(--color-accent-500)]/30',
  PASS: 'bg-status-success-soft text-status-success border-status-success/30',
  NOTE: 'bg-fb-surface-muted text-fb-text-secondary border-fb-border',
};

function BadgeChip({ badge }: { badge: BadgeDefinition }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${GROUP_TONE[badge.group]} ${badge.defaultEnabled ? '' : 'opacity-60'}`}
      title={badge.meaning}
    >
      {badge.label}
      {!badge.defaultEnabled && <span className="font-normal">(tắt)</span>}
    </span>
  );
}

function GroupChip({ group }: { group: FindingGroup }) {
  const label = FINDING_GROUPS.find((item) => item.id === group)?.label ?? group;
  return <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${GROUP_TONE[group]}`}>{label}</span>;
}

/** Rule objects (src/lib/scoring/registry.ts) — selectable ones first, then those that always run. */
const RULE_CATALOG = buildRuleCatalog();

/** "Logic cảnh báo" §10 — the Rule Groups in force, read when the popup opens (every signed-in user). */
function RuleGroupsInForce({ isOpen }: { isOpen: boolean }) {
  const [groups, setGroups] = useState<RuleGroupSummaryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    void fetch('/api/rule-group-summary', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { groups?: RuleGroupSummaryItem[]; error?: string };
        if (!response.ok || !payload.groups) throw new Error(payload.error || 'Không thể tải danh sách nhóm rule.');
        if (!cancelled) setGroups(payload.groups);
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Không thể tải danh sách nhóm rule.'); });
    return () => { cancelled = true; };
  }, [isOpen]);
  if (error) return <p className="text-xs text-status-danger">{error}</p>;
  if (!groups) return <p className="text-xs">Đang tải…</p>;
  const selectable = RULE_CATALOG.filter((rule) => !rule.core);
  return (
    <div className="overflow-x-auto">
      <table className="ui-table w-full text-xs">
        <thead><tr><th className="text-left">Ưu tiên</th><th className="text-left">Nhóm rule</th><th className="text-left">Điều kiện ngày Epic</th><th className="text-left">Rule áp dụng</th></tr></thead>
        <tbody>
          {groups.map((group) => {
            const off = selectable.filter((rule) => (group.offRuleIds ?? []).includes(rule.id));
            const on = selectable.filter((rule) => group.ruleIds.includes(rule.id));
            const inherited = selectable.length - on.length - off.length;
            return (
              <tr key={group.name}>
                <td className="align-top">{group.isDefault ? 'Cuối' : group.priority ?? 'Tắt'}</td>
                <td className="align-top font-semibold text-fb-text-primary">{group.name}{!group.enabled && <span className="font-normal"> (tắt)</span>}</td>
                <td className="align-top">{group.conditions}</td>
                <td className="align-top">
                  {group.isDefault
                    ? (inherited === 0 ? `Bật tất cả ${selectable.length} rule chọn được` : <>Bật {on.length}/{selectable.length} rule — <strong className="text-fb-text-primary">không áp dụng</strong>: {selectable.filter((rule) => !group.ruleIds.includes(rule.id)).map((rule) => rule.name).join(', ')}</>)
                    : (on.length + off.length === 0
                      ? 'Kế thừa toàn bộ (chưa ghi đè rule nào)'
                      : <>Ghi đè {on.length + off.length} rule{on.length > 0 && <> — <strong className="text-fb-text-primary">bật</strong>: {on.map((rule) => rule.name).join(', ')}</>}{off.length > 0 && <> — <strong className="text-fb-text-primary">tắt</strong>: {off.map((rule) => rule.name).join(', ')}</>}; còn lại kế thừa</>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const badgeLabel = (id: string) => BADGE_LIST.find((badge) => badge.id === id)?.label ?? id;
const badgeAxisLabel = (id: string) => {
  const axis = BADGE_LIST.find((badge) => badge.id === id)?.axis;
  return SCORING_AXES.find((item) => item.id === axis)?.label ?? '';
};

/**
 * "Logic cảnh báo" — the Epic Scoring Service's Axis → Finding Group → Badge matrix, rendered
 * straight from src/lib/scoring/catalog.ts (see docs/superpowers/specs/2026-09-29-scoring-service-design.md)
 * so this help text can never drift from the catalog the service itself uses.
 */
export function AlertLogicModal({ isOpen, onClose }: HelpPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Modal
      actions={<ModalContentSearch containerRef={bodyRef} isOpen={isOpen} />}
      bodyRef={bodyRef}
      icon={Warning}
      isOpen={isOpen}
      onClose={onClose}
      title="Logic cảnh báo Epic — Scoring Service"
      maxWidth="3xl"
      footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <div className="flex flex-col gap-6 text-sm text-fb-text-secondary">
        <section className="rounded-md border border-status-warning/30 bg-status-warning-soft px-3 py-2 text-xs text-fb-text-primary">
          <strong>Scoring Service.</strong> Mọi Epic được chấm điểm lại mỗi lần tạo cache; Scoring Service là logic duy nhất của mọi màn hình (logic cảnh báo cũ đã gỡ).
          Rule mới chỉ có hiệu lực sau lần tạo lại cache kế tiếp. Trên Quản trị Epic, cột NHẬN XÉT gom kết luận vào 4 ô:
          <strong> Kết quả</strong> (Đạt / Fail TTM-CNTT (QLDA) và TTM-E2E), <strong>Xử lý</strong> (Thiếu lý do Fail TTM, Thiếu phòng chịu TN chính và các khuyến nghị khác),
          <strong>Cảnh báo</strong> (Cảnh báo muộn, Sai Status, Chờ golive, Giải trình Golive, Pending lâu), <strong>Sai lệch dữ liệu</strong> (mỗi rule vi phạm một mục);
          cột PASS chỉ hiện Đạt / Fail TTM-CNTT (QLDA).
        </section>

        <section>
          <h3 className="ui-card-title mb-1">1. Nguyên tắc</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>Mọi rule nằm trong <strong className="text-fb-text-primary">1 Scoring Service duy nhất</strong>. Đầu vào là dữ liệu 1 Epic và mốc <code>asOf</code>; đầu ra là <strong className="text-fb-text-primary">danh sách finding</strong>, mỗi finding gắn đúng 1 badge.</li>
            <li>Mỗi badge thuộc <strong className="text-fb-text-primary">đúng 1 Axis</strong> và <strong className="text-fb-text-primary">đúng 1 Finding Group</strong>. Một Epic có thể có nhiều badge cùng lúc trên nhiều axis; màn hình tự chọn badge cần hiển thị.</li>
            <li><code>asOf</code> là mốc &quot;hôm nay&quot; tương đối theo giờ Việt Nam: bằng hôm nay khi xem hiện tại, bằng ngày của lớp dữ liệu khi xem quá khứ. Dữ liệu Epic và story/subtask đều lấy tại <code>asOf</code>.</li>
            <li>Tham số (offset, thời hạn grace, khoảng ngày, tỉ lệ…) lấy từ cấu hình trong DB; logic nằm trong code dưới dạng các <strong className="text-fb-text-primary">Rule object</strong> (mục 9). Rule nào chấm Epic nào do <strong className="text-fb-text-primary">nhóm rule</strong> quyết định (mục 10, SUPERADMIN cấu hình ở Rule Management).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">2. Finding Groups</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {FINDING_GROUPS.map((group) => (
              <div key={group.id} className="rounded-md border border-fb-border p-2">
                <GroupChip group={group.id} />
                <p className="mt-1 text-xs">{group.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">3. Ma trận Axis × Finding Group</h3>
          <div className="overflow-x-auto">
            <table className="ui-table w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left">Axis</th>
                  {FINDING_GROUPS.map((group) => <th key={group.id} className="text-left"><GroupChip group={group.id} /></th>)}
                </tr>
              </thead>
              <tbody>
                {SCORING_AXES.map((axis) => (
                  <tr key={axis.id}>
                    <td className="align-top">
                      <div className="font-semibold text-fb-text-primary">{axis.label}</div>
                      <div className="text-[11px]">{axis.description}</div>
                    </td>
                    {FINDING_GROUPS.map((group) => {
                      const badges = badgesOf(axis.id, group.id);
                      return (
                        <td key={group.id} className="align-top">
                          {badges.length ? <div className="flex flex-col items-start gap-1">{badges.map((badge) => <BadgeChip key={badge.id} badge={badge} />)}</div> : <span className="text-fb-text-placeholder">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px]">(tắt) = rule có sẵn nhưng mặc định tắt. Di chuột lên badge để xem ý nghĩa. Riêng axis Chất lượng dữ liệu: chỉ badge nhóm Cảnh báo được tính là &quot;Sai lệch dữ liệu&quot; — bảng rule R1–R10 đầy đủ (điều kiện, miễn trừ, hệ quả) ở Tài liệu sản phẩm mục 9.1.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Ký hiệu dùng trong công thức</h3>
          <ul className="ml-5 list-disc space-y-0.5 text-xs">
            <li><code>T0</code> = Idea Approved Date (trống thì dùng ngày tạo Epic trên Jira) · <code>T1</code> = Start Date · <code>R4G</code> = R4G Date · <code>Due</code> = Due Date.</li>
            <li><code>X +wd n</code> = cộng n ngày làm việc (bỏ Thứ Bảy, Chủ Nhật, ngày nghỉ; tính cả ngày làm bù) · <code>WD(a, b)</code> = số ngày làm việc từ a tới b.</li>
            <li><code>N_CNTT</code>, <code>N_E2E</code> = ngân sách ngày làm việc theo &quot;Tiêu chí Time to Market&quot; của loại Epic · <code>Target_CNTT = T1 +wd (N_CNTT − 1)</code> (Start Date là ngày 1; trùng baseline pha R4GOLIVE và dải TTM-CNTT (QLDA)) · <code>Target_E2E = T0 +wd (N_E2E − 1)</code>.</li>
            <li><code>G</code> = thời hạn grace của trục Release (mặc định 5 ngày làm việc) · <code>Offset_muộn</code> = mốc cảnh báo muộn theo loại Epic × status (&quot;Cấu hình cảnh báo&quot;).</li>
            <li>So sánh status theo thứ tự workflow: TO DO → IN PO → DESIGN → DEV → TEST → PENTEST → R4GOLIVE → MVP DONE → PILOT → DONE → RELEASED. Pending / Reopened ngang hàng DEV (In Progress).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">5. Chi tiết badge — ý nghĩa &amp; công thức</h3>
          <div className="overflow-x-auto">
            <table className="ui-table w-full text-xs">
              <thead>
                <tr><th className="text-left">Badge</th><th className="text-left">Group</th><th className="text-left">Ý nghĩa</th><th className="text-left">Công thức</th></tr>
              </thead>
              <tbody>
                {SCORING_AXES.flatMap((axis) => [
                  <tr key={axis.id}><td colSpan={4} className="bg-fb-surface-muted font-semibold text-fb-text-primary">{axis.label}</td></tr>,
                  ...BADGE_LIST.filter((badge) => badge.axis === axis.id).sort((a, b) => a.precedence - b.precedence).map((badge) => (
                    <tr key={badge.id}>
                      <td className="align-top"><BadgeChip badge={badge} /></td>
                      <td className="align-top"><GroupChip group={badge.group} /></td>
                      <td className="align-top">{badge.meaning}</td>
                      <td className="align-top"><code className="whitespace-pre-wrap text-[11px]">{badge.formula}</code></td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">6. Thứ tự ưu tiên — badge bị che</h3>
          <p className="text-xs">Badge bị che vẫn được trả về (để tra cứu) nhưng màn hình mặc định không hiển thị. Trong cùng axis, badge có thứ tự ưu tiên cao hơn hiển thị trước (theo thứ tự các dòng ở mục 5).</p>
          <table className="ui-table mt-1 w-full text-xs">
            <thead><tr><th className="text-left">Khi có badge</th><th className="text-left">Thì che các badge</th></tr></thead>
            <tbody>
              {SUPPRESSIONS.map((rule) => (
                <tr key={rule.when}>
                  <td>{badgeAxisLabel(rule.when)}: <strong className="text-fb-text-primary">{badgeLabel(rule.when)}</strong></td>
                  <td>{rule.suppress.map(badgeLabel).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">7. Chỉ số TTM-CNTT (QLDA) / TTM-CNTT (QA) / TTM-E2E</h3>
          <p className="text-xs">Chỉ số chỉ đếm các cờ dưới đây (không phải badge), nên &quot;Đạt&quot; của chỉ số luôn trùng với badge &quot;Đạt TTM-CNTT (QLDA)&quot;. Nếu không nói rõ khác, chỉ số tính trên đúng các Epic đang xem (theo phạm vi quyền và bộ lọc của màn hình); riêng 3 widget cố định trên banner (TTM Dashboard 2, Quản trị Epic) tính trên toàn bộ Epic trong ứng dụng. Chưa có Epic nào được kết luận (mẫu số = 0) thì hiện &quot;—&quot;.</p>
          <table className="ui-table mt-1 w-full text-xs">
            <thead><tr><th className="text-left">Chỉ số</th><th className="text-left">Cờ</th><th className="text-left">Điều kiện</th></tr></thead>
            <tbody>
              {INDEX_MEMBERSHIP_RULES.map((rule) => (
                <tr key={`${rule.index}-${rule.flag}`}><td>{rule.index}</td><td className="font-semibold text-fb-text-primary">{rule.flag}</td><td><code className="whitespace-pre-wrap text-[11px]">{rule.formula}</code></td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs"><code>{INDEX_PERCENT_FORMULA}</code></p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">8. Thay đổi so với logic cũ (chốt từ 29/09/2026, cập nhật 19/10/2026)</h3>
          <ul className="ml-5 list-disc space-y-1 text-xs">
            <li><strong className="text-fb-text-primary">Nhóm rule — Rule Management</strong> (25/10/2026): thay cho &quot;Phạm vi rule Sai lệch dữ liệu&quot; (10/10/2026) và công tắc bật/tắt từng badge. Mỗi Epic được chấm theo mọi nhóm rule mà mốc ngày của nó khớp (ưu tiên cao → thấp → Default); mỗi rule có trạng thái Kế thừa / Bật / Tắt trong từng nhóm, nhóm gần nhất khai báo rule quyết định (mục 9, 10). Rule TTM-CNTT bị Tắt (hoặc không nhóm nào bật): Epic bị loại ở L02 (không tính TTM-CNTT (QLDA) / (QA)); TTM-E2E tương tự: không tính TTM-E2E.</li>
            <li><strong className="text-fb-text-primary">&quot;Thiếu lý do Fail TTM&quot; và &quot;Thiếu phòng chịu TN chính&quot;</strong> (10/10 và 14/10/2026, nhóm Khuyến nghị): chỉ xét Epic Fail TTM-CNTT có R4G Date muộn hơn Target — thiếu cả 9 trường khâu fail / thiếu trường &quot;Phòng chịu trách nhiệm chính&quot;. Không đổi kết luận Đạt / Fail; gom thành widget THIẾU LÝ DO trên TTM Dashboard 2 và panel đầu tiên của màn hình Chuẩn hoá dữ liệu.</li>
            <li><strong className="text-fb-text-primary">Reopened</strong> (05/10/2026): Epic đã golive rồi bị mở lại không bị R8 với R4G Date đã tới (giữ kết luận TTM, không gắn &quot;Sai Status&quot;); R4G Date ở tương lai thì vẫn là R10.</li>
            <li><strong className="text-fb-text-primary">Bỏ &quot;Cảnh báo sớm&quot;</strong> ở cả TTM-CNTT (QLDA), trục Release và cột pha. Offset &quot;sớm&quot; trong Cấu hình cảnh báo không còn được dùng. Trường hợp trục Release trước đây hiện &quot;Cảnh báo sớm&quot; (status đã qua R4GOLIVE, chưa có Due Date, còn trong hạn) nay không hiện badge nào cho tới khi quá hạn thành &quot;Giải trình Golive&quot;.</li>
            <li><strong className="text-fb-text-primary">Sai lệch dữ liệu được xét trước</strong> (01/10/2026): Epic có Sai lệch dữ liệu (R1, R3–R6, R8, R9, R10) không được chấm Đạt / Fail / Cảnh báo muộn / Sai Status trên TTM-CNTT (QLDA), TTM-CNTT (QA) và TTM-E2E — chỉ hiện Sai lệch dữ liệu cho tới khi dữ liệu được sửa.</li>
            <li><strong className="text-fb-text-primary">&quot;Sai Status&quot;</strong> (TTM-CNTT (QLDA) và TTM-E2E, nhóm Khuyến nghị): ngày ghi nhận đúng hạn và đã tới nhưng status chưa lên R4GOLIVE — Epic <strong>vẫn được tính Đạt</strong>, badge &quot;Sai Status&quot; hiện kèm. Ngày R4G ở tương lai không được tính Đạt (từ 09/10/2026 là Sai lệch dữ liệu). Từ 04/10/2026, Epic có R4G Date mà status chưa lên R4GOLIVE là Sai lệch dữ liệu (R8) nên trường hợp này chỉ còn xảy ra khi rule R8 bị tắt.</li>
            <li><strong className="text-fb-text-primary">Công thức TTM-CNTT (QLDA) / (QA)</strong> (04/10/2026): Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba) — Epic Đạt trên tổng Epic đã có kết luận (Đạt, Fail có R4G Date muộn hơn Target, Fail chưa có R4G Date đã quá Target). Trước đây mẫu số là mọi Epic có R4G Date (gồm cả R4G tương lai) và không tính Epic Fail chưa có R4G Date. TTM-CNTT (QA) dùng cùng công thức, chỉ lấy Epic MVP Done / Released. Tên các tiêu chí L01…L05bb xem ở TTM Dashboard 2.</li>
            <li><strong className="text-fb-text-primary">Chất lượng dữ liệu</strong> (04/10/2026): thêm <strong>R8</strong> (có R4G Date nhưng status &lt; R4GOLIVE) và <strong>R9</strong> (status ≥ R4GOLIVE nhưng chưa có R4G Date); <strong>R1</strong> &quot;Thiếu Start Date&quot; tính từ status DESIGN (trước đây từ DEV); <strong>R5</strong> &quot;Thiếu Requirement Level&quot; chỉ tính khi status đã qua DESIGN; từ 11/10/2026 Epic <strong>Pending</strong> được miễn R5 khi status trước đó (<code>previous_status</code>) là To Do hoặc In PO, từ 14/10/2026 cả khi là Design; từ 12/10/2026 Epic Pending trước đó là To Do / In PO cũng được miễn <strong>R1</strong> (R1 không miễn Design).</li>
            <li><strong className="text-fb-text-primary">Epic ngoại lệ không được xét</strong> (09/10/2026): &quot;Epic ngoại lệ&quot; là tên gọi chung của Epic trong danh sách Black listed và Epic thuộc dự án có Time to Market = N. Scoring Service không chạy rule nào cho các Epic này — không có Sai lệch dữ liệu, Đạt / Fail, Cảnh báo, Chờ / Giải trình golive, trễ pha hay khuyến nghị — chỉ ghi nhận badge &quot;Epic ngoại lệ (Black listed)&quot; hoặc &quot;Epic ngoại lệ (dự án TTM = N)&quot; ở axis Phạm vi (kèm &quot;Ngoài phạm vi&quot; nếu có). Chúng không tính vào chỉ số nào và không tính vào bất kỳ widget nào của TTM Dashboard 2.</li>
            <li><strong className="text-fb-text-primary">R4G Date không được khai báo trước</strong> (09/10/2026, quy định của công ty): mọi Epic có R4G Date còn ở tương lai là Sai lệch dữ liệu, chỉ trừ Cancelled — status chưa tới R4GOLIVE là <strong>R8</strong> (từ 08/10/2026), status từ R4GOLIVE trở lên hoặc Reopened là <strong>R10</strong> &quot;R4G Date ở tương lai&quot; (mới). Epic owner xoá giá trị khỏi trường R4G Date và ghi ngày dự kiến ở một trường thông tin phụ khác. Các Epic này không được chấm Đạt / Fail và nằm ngoài mẫu số; nhóm &quot;chưa kết luận&quot; (L05ac) chỉ còn Epic không tính được Target.</li>
            <li><strong className="text-fb-text-primary">TTM-E2E</strong> (01/10/2026): <code>Target_E2E = T0 +wd (N_E2E − 1)</code>; Đạt không còn yêu cầu status Released; Fail khi ngày kết thúc &gt; Target, hoặc chưa có ngày kết thúc mà đã quá Target.</li>
            <li><strong className="text-fb-text-primary">R7 thành &quot;Sai Status&quot; (Release)</strong> thuộc nhóm Khuyến nghị: Epic chỉ vi phạm R7 không còn bị đánh dấu &quot;Sai lệch dữ liệu&quot; (không bị đẩy xuống cuối bảng) và được tính vào mẫu số TTM-CNTT (QLDA).</li>
            <li><strong className="text-fb-text-primary">R2 &quot;Pending lâu&quot;</strong> thuộc nhóm Khuyến nghị, không còn bị đánh dấu &quot;Sai lệch dữ liệu&quot;.</li>
            <li><strong className="text-fb-text-primary">Hoàn thành pha theo asOf</strong>: khi xem lớp dữ liệu cũ, trạng thái story/subtask được lấy tại ngày đó thay vì hôm nay.</li>
            <li><strong className="text-fb-text-primary">Mốc Target_CNTT thống nhất</strong> = <code>T1 +wd (N_CNTT − 1)</code> cho mọi badge (Fail, Cảnh báo muộn, Sai Status, Đạt, Phạm vi) — logic cũ dùng <code>T1 +wd N_CNTT</code> cho badge nên Fail sớm hơn tối đa 1 ngày làm việc.</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">9. Rule object</h3>
          <p className="text-xs">Mỗi Rule object là một đơn vị logic phát ra một nhóm badge. <strong className="text-fb-text-primary">Rule chọn được</strong> chỉ chạy cho Epic khi nhóm gần nhất khai báo nó ở trạng thái Bật; <strong className="text-fb-text-primary">rule luôn chạy</strong> áp dụng cho mọi Epic. Mỗi rule chọn được nằm trong một <em>slot</em> (vị trí): rule TTM-CNTT (QLDA) / TTM-E2E và từng rule chất lượng dữ liệu, lý do Fail, Release đều có slot riêng; mỗi nhóm bật tối đa 1 rule cho mỗi slot, các biến thể của một slot phát cùng badge nên chỉ số và phễu không đổi cách đếm.</p>
          <div className="mt-1 overflow-x-auto">
            <table className="ui-table w-full text-xs">
              <thead><tr><th className="text-left">Rule</th><th className="text-left">Loại</th><th className="text-left">Tóm tắt</th><th className="text-left">Badge</th></tr></thead>
              <tbody>
                {RULE_CATEGORY_ORDER.flatMap((category) => {
                  const rules = RULE_CATALOG.filter((rule) => rule.category === category);
                  if (!rules.length) return [];
                  return [
                    <tr key={category}><td colSpan={4} className="bg-fb-surface-muted font-semibold text-fb-text-primary">{RULE_CATEGORY_LABELS[category]}</td></tr>,
                    ...rules.map((rule) => (
                      <tr key={rule.id}>
                        <td className="align-top"><div className="font-semibold text-fb-text-primary">{rule.name}</div><code className="text-xs">{rule.id}</code></td>
                        <td className="align-top whitespace-nowrap">{rule.core ? 'Luôn chạy' : rule.slot ? `Đánh giá ${RULE_SLOT_LABELS[rule.slot]}` : 'Chọn theo nhóm'}</td>
                        <td className="align-top">{rule.summary}{rule.requires.length > 0 && <> Cần rule đánh giá {rule.requires.map((slot) => RULE_SLOT_LABELS[slot]).join(', ')} đang áp dụng cho Epic.</>}</td>
                        <td className="align-top">{rule.emits.map((badge) => badge.label).join(', ')}</td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">10. Nhóm rule đang áp dụng</h3>
          <p className="mb-1 text-xs">Epic được chấm theo mọi nhóm <strong className="text-fb-text-primary">bật</strong> mà nó khớp mọi điều kiện ngày (AND, tính cả hai đầu; Epic thiếu ngày đó thì không khớp), từ ưu tiên cao xuống thấp, cuối cùng là Default; với mỗi rule, nhóm gần nhất khai báo rule đó (Bật / Tắt) quyết định, rule không khai báo là Kế thừa từ nhóm dưới. Chỉ số toàn công ty là tổng hợp kết quả của các nhóm — xem chiều &quot;Theo Nhóm rule&quot; trên TTM Dashboard 2.</p>
          <RuleGroupsInForce isOpen={isOpen} />
        </section>
      </div>
    </Modal>
  );
}

/**
 * Box-and-arrow diagram of the end-to-end data pipeline (2026-10-19): import → "Từ chối import" →
 * canonical issues + history layers → refreshDerivedCaches (Scoring Service) → derived caches → screens.
 * Colors are IAS tokens passed through `style` (SVG presentation attributes don't resolve `var()`),
 * so the diagram follows the light/dark theme.
 */
type PipelineTone = 'brand' | 'gate' | 'neutral' | 'result';

const PIPELINE_TONE: Record<PipelineTone, { fill: string; stroke: string }> = {
  brand: { fill: 'var(--color-primary-50)', stroke: 'var(--color-primary-200)' },
  gate: { fill: 'var(--color-bg-warning)', stroke: 'var(--color-border-warning)' },
  neutral: { fill: 'var(--color-bg-surface)', stroke: 'var(--color-border-default)' },
  result: { fill: 'var(--color-bg-success)', stroke: 'var(--color-border-success)' },
};

function DataPipelineDiagram() {
  const box = (x: number, y: number, w: number, h: number, label: string, sub: string, tone: PipelineTone = 'brand') => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} style={{ fill: PIPELINE_TONE[tone].fill, stroke: PIPELINE_TONE[tone].stroke }} />
      <text x={x + w / 2} y={y + h / 2 - 4} fontSize="11.5" fontWeight="700" textAnchor="middle" style={{ fill: 'var(--color-text-primary)' }}>{label}</text>
      <text x={x + w / 2} y={y + h / 2 + 12} fontSize="9.5" textAnchor="middle" style={{ fill: 'var(--color-text-secondary)' }}>{sub}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.5" markerEnd="url(#pipeline-arrowhead)" style={{ stroke: 'var(--color-border-strong)' }} />
  );
  return (
    <svg viewBox="0 0 920 300" role="img" aria-label="Sơ đồ luồng xử lý dữ liệu Epic" className="w-full">
      <defs>
        <marker id="pipeline-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" style={{ fill: 'var(--color-border-strong)' }} />
        </marker>
      </defs>

      {box(10, 20, 150, 52, 'CSV / API tự động', 'Issue cập nhật trong ngày', 'neutral')}
      {arrow(160, 46, 185, 46)}
      {box(185, 20, 165, 52, 'Từ chối import', 'Danh sách · rule A, B, Epic', 'gate')}
      {arrow(350, 46, 375, 46)}
      {box(375, 20, 150, 52, 'issues', '1 lớp dữ liệu / lần import')}
      {arrow(450, 72, 450, 100)}
      {box(375, 100, 150, 52, 'aggregateBatchData()', 'Dòng thời gian cảnh báo')}
      {arrow(375, 126, 330, 126)}
      {box(170, 100, 160, 52, 'epic_alert_timeline', 'Dòng thời gian cảnh báo', 'neutral')}

      {arrow(525, 46, 575, 46)}
      {box(575, 20, 175, 52, 'refreshDerivedCaches()', 'Có khoá — 1 lượt mỗi lúc')}
      {arrow(662, 72, 662, 100)}
      {box(575, 100, 175, 52, 'Scoring Service', 'Epic ngoại lệ · PM/SM · rule')}
      {arrow(662, 152, 662, 180)}
      {box(560, 180, 205, 52, 'Cache dẫn xuất', 'epic_alert_row_cache · ttm_*_cache', 'neutral')}
      {arrow(662, 232, 662, 248)}
      {box(520, 248, 285, 44, 'Màn hình & MCP', 'Đọc cache — không tính lại mỗi lần tải', 'result')}

      {box(780, 20, 130, 52, 'Kích hoạt', 'Import · đầu ngày', 'neutral')}
      {arrow(780, 46, 750, 46)}
      {box(780, 100, 130, 52, 'Kích hoạt', 'Đổi cấu hình · nút', 'neutral')}
      {arrow(780, 120, 750, 60)}
    </svg>
  );
}

export function DataLogicModal({ isOpen, onClose }: HelpPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Modal
      actions={<ModalContentSearch containerRef={bodyRef} isOpen={isOpen} />}
      bodyRef={bodyRef}
      isOpen={isOpen}
      onClose={onClose}
      title="Logic xử lý dữ liệu (Admin)"
      maxWidth="xl"
      footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}
    >
      <div className="flex flex-col gap-5 text-fb-text-secondary">
        <section>
          <h3 className="ui-card-title mb-1">1. Mô hình import theo lớp dữ liệu hàng ngày</h3>
          <p>Mỗi lần import (upload trên màn hình Nguồn dữ liệu hoặc API tự động) là 1 lớp dữ liệu (data layer), gắn với <code>aggregated_at</code>. File chỉ chứa các issue có trường <em>updated</em> trong ngày — không phải full snapshot. &quot;Trạng thái mới nhất&quot; của một issue là bản ghi có <code>aggregated_at</code> lớn nhất trong toàn bộ lịch sử.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">2. Luồng xử lý end-to-end</h3>
          <DataPipelineDiagram />
          <ol className="ml-5 mt-2 list-decimal space-y-1 text-xs">
            <li><strong className="text-fb-text-primary">Đọc &amp; kiểm tra</strong> file theo adapter (CSV Jira / Py Jira API). Ngày sai thứ tự chỉ là cảnh báo (mục 4), không chặn dòng.</li>
            <li><strong className="text-fb-text-primary">Từ chối import</strong> (mục 7): bỏ mọi dòng của Epic bị từ chối (cùng Story/Subtask của nó) trước khi ghi gì vào CSDL.</li>
            <li><strong className="text-fb-text-primary">Ghi</strong> <code>issues</code> của lớp mới, rồi <code>aggregateBatchData()</code> ghi dòng thời gian cảnh báo.</li>
            <li><strong className="text-fb-text-primary">Tạo lại cache</strong> (<code>refreshDerivedCaches</code>): dựng dòng Epic của lớp mới nhất, đóng dấu Epic ngoại lệ và PM/SM theo component được gán, cho Scoring Service chấm mọi Epic (luôn chấm song song và đối chiếu với logic cũ), rồi ghi 3 cache. Mỗi lúc chỉ một lượt chạy; yêu cầu đến giữa chừng được gộp và lượt đang chạy chạy thêm một lần.</li>
            <li><strong className="text-fb-text-primary">Màn hình</strong> (Quản trị Epic, Chuẩn hoá dữ liệu, TTM Dashboard 2, Báo cáo Epic) và MCP đọc cache theo phạm vi quyền của người xem.</li>
          </ol>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">3. Các bảng dữ liệu chính trong CSDL</h3>
          <table className="ui-table w-full text-xs">
            <thead><tr><th className="text-left">Bảng</th><th className="text-left">Vai trò</th><th className="text-left">Khi dữ liệu hết hạn lưu trữ</th></tr></thead>
            <tbody>
              <tr><td>import_batches</td><td>Metadata từng đợt import (số dòng thành công / cảnh báo / lỗi)</td><td>Giữ mỗi ngày một dòng; chỉ xóa khi quá hạn lưu trữ và không còn dòng issues nào thuộc đợt đó</td></tr>
              <tr><td>issues</td><td>Dữ liệu Epic/Story/Subtask canonical, 1 dòng/issue/batch (gồm cả các trường lý do Fail TTM <code>khau_*</code>, <code>main_fail_dept</code>, <code>previous_status</code>)</td><td>Làm thưa mỗi ngày: giữ mọi phiên bản của 30 ngày import gần nhất; xa hơn chỉ giữ phiên bản đang có hiệu lực vào ngày làm việc cuối mỗi tuần (bảng <code>data_snapshot_dates</code>) trong thời hạn lưu, và luôn giữ phiên bản mới nhất của mỗi issue. Màn hình chọn ngày chỉ đọc &quot;trạng thái tại ngày X&quot; với các ngày này</td></tr>
              <tr><td>epic_alert_timeline</td><td>Các &quot;đợt&quot; cảnh báo liên tục (Fail TTM-CNTT, Cảnh báo muộn, Fail TTM-E2E, Thiếu Start Date, Sai lệch dữ liệu) cho popup Epic History — ghi ở mỗi lần <code>aggregateBatchData()</code></td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_alert_row_cache · ttm_index_global_cache · ttm_dashboard_2_cache</td><td>Cache dẫn xuất: dòng Epic đã chấm (badge, cờ chỉ số), chỉ số toàn công ty, số liệu TTM Dashboard 2 theo phạm vi quyền</td><td>Dựng lại ở lần tạo lại cache kế tiếp</td></tr>
              <tr><td>black_listed_epics · denied_import_epics</td><td>Epic ngoại lệ (không tính TTM, Scoring Service không xét) · danh sách Từ chối import (không được vào CSDL)</td><td>Không liên quan</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Sai lệch dữ liệu — không chặn import</h3>
          <p>
            Rule ngày sai thứ tự (ví dụ R4G Date sớm hơn Start Date) chỉ là <strong className="text-fb-text-primary">cảnh báo (WARNING)</strong> lúc import; dòng
            <strong> vẫn được ghi vào <code>issues</code></strong> để user chủ động làm sạch dữ liệu trên Jira thay vì Epic biến mất khỏi hệ thống.
          </p>
          <p>
            Khi tạo cache, <strong className="text-fb-text-primary">Scoring Service</strong> đánh giá &quot;Sai lệch dữ liệu&quot; theo các rule <strong>R1, R3–R6, R8–R10</strong>
            (R2 &quot;Pending lâu&quot; và R7 &quot;Sai Status (Release)&quot; là khuyến nghị, không tính là sai lệch). Epic sai lệch dữ liệu không được chấm Đạt / Fail và nằm ngoài
            mẫu số các chỉ số; danh sách cần sửa xem ở màn hình <strong className="text-fb-text-primary">Chuẩn hoá dữ liệu</strong>. SUPERADMIN chọn rule nào áp dụng cho từng nhóm Epic theo
            mốc ngày (Quản trị hệ thống → &quot;Rule Management&quot;). Bảng rule đầy đủ: popup &quot;Logic cảnh báo&quot; và Tài liệu sản phẩm mục 9.1.
          </p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">5. Quản lý lớp dữ liệu &amp; Sao lưu/Phục hồi</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Xóa N lớp dữ liệu gần nhất</strong>: xóa <em>cả raw lẫn mốc hoàn thành</em> của N ngày import gần nhất — dùng khi cần loại bỏ hẳn một đợt dữ liệu lỗi.</li>
            <li><strong className="text-fb-text-primary">Sao lưu / Phục hồi dữ liệu (/admin/database)</strong>: file SQL cho user, domain, dự án, phân quyền dự án/domain, component, ngày nghỉ, rule cảnh báo, <code>import_batches</code>, <code>issues</code>, dòng thời gian cảnh báo, mốc hoàn thành, audit log. Từ 19/10/2026 gồm cả cấu hình: Epic ngoại lệ, danh sách Từ chối import và ngày A/B, cấu hình Scoring Service / &quot;Phạm vi dữ liệu cho TTM&quot;, Ma trận phân quyền, Tiêu chí TTM, ngày làm bù. <strong className="text-fb-text-primary">Không gồm</strong> các bảng cache (dựng lại được bằng &quot;Tạo lại cache&quot;).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">6. Các màn hình lấy dữ liệu từ đâu?</h3>
          <p>Quản trị Epic, Chuẩn hoá dữ liệu, TTM Dashboard 2 và MCP <strong>đọc cache dẫn xuất</strong>, không tính lại cảnh báo ở mỗi lần tải trang. Vì vậy kết luận của Epic chỉ đổi sau lần tạo lại cache kế tiếp — sau import, lượt đầu ngày (để cảnh báo theo ngày hiện tại tự cập nhật dù không import), khi lưu cấu hình phạm vi / Epic ngoại lệ / dự án / domain / PM-SM, hoặc khi SUPERADMIN bấm &quot;Tạo lại cache&quot;. Mọi màn hình hiện chỉ báo khi đang có lượt tạo lại cache. Khi chưa có cache (CSDL mới), màn hình tạm tính trực tiếp.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">7. Từ chối import &amp; Xóa Epic (từ 14/10/2026, chỉ SUPERADMIN)</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Epic bị từ chối</strong> khi: có trong danh sách Từ chối import (và không bật &quot;Cho phép import&quot;), <em>hoặc</em> vi phạm rule tự động — issue type cấp 1 khác Epic; Created trước ngày <strong>A</strong>; Released / MVP Done trước ngày <strong>B</strong> (tạm dùng Due Date, trống thì R4G Date; không áp dụng khi CSDL từng ghi nhận Epic ở status khác Released vào/sau ngày B).</li>
            <li>Mọi dòng của Epic bị từ chối (kể cả Story/Subtask) bị bỏ khỏi file. Epic bị rule bắt <strong className="text-fb-text-primary">tự được thêm vào danh sách</strong> (nguồn AUTO_RULE). Dữ liệu cũ của nó chỉ bị xóa vĩnh viễn khi là <strong className="text-fb-text-primary">upload thủ công</strong> (có hộp xác nhận liệt kê Epic) và không quá <strong>25 Epic</strong> còn dữ liệu; <strong className="text-fb-text-primary">import qua API tự động không bao giờ xoá</strong> — dữ liệu được giữ để SUPERADMIN kiểm tra và xoá bằng &quot;Xóa dữ liệu còn tồn tại&quot;.</li>
            <li>Epic chỉ được nhận nhờ ngoại lệ của rule B được <strong className="text-fb-text-primary">tự ghi &quot;Cho phép import&quot;</strong> (nguồn &quot;Miễn rule B&quot;) ngay lần đầu, để không bị rule B bắt khi lịch sử làm bằng chứng đã bị xoá. Ngày A/B không được đặt sau ngày hôm nay.</li>
            <li><strong className="text-fb-text-primary">Xóa Epic</strong> (tab Từ chối import): xóa Epic + Story + Subtask có trạng thái mới nhất thuộc Epic đó ở mọi lớp dữ liệu và mọi bảng theo Epic (lịch sử, dòng thời gian, vi phạm, cache dòng Epic, Epic ngoại lệ); mỗi Epic một dòng audit log. <strong className="text-fb-text-primary">Không tự tạo lại cache</strong> — chạy &quot;Tạo lại cache&quot; sau khi xóa.</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">8. API import dữ liệu tự động (cho script Python)</h3>
          <p>Ngoài form upload trên màn hình Nguồn dữ liệu (xác thực bằng session, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>), script export Jira có thể gọi endpoint riêng — dùng chung pipeline <code>processImport()</code> (gồm cả Từ chối import ở mục 7), cùng định dạng CSV/adapter <code>PY_JIRA_API</code>.</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Endpoint</strong>: <code>POST /api/data-source/import/auto</code>, body <code>multipart/form-data</code> với field <code>file</code>.</li>
            <li><strong className="text-fb-text-primary">Xác thực</strong>: header <code>Authorization: Bearer &lt;token&gt;</code>, so khớp biến môi trường <code>IMPORT_API_TOKEN</code> bằng SHA-256 + so sánh constant-time. Tạo token (ví dụ <code>openssl rand -hex 32</code>), khai báo trong <code>.env.local</code> và trên Vercel, rồi khởi động lại server.</li>
            <li><strong className="text-fb-text-primary">aggregatedAt</strong> luôn là thời điểm gọi API. Response giữ contract của <code>processImport()</code> (<code>successRows</code>/<code>warningRows</code>/<code>errorRows</code>, số dòng bị từ chối).</li>
            <li><strong className="text-fb-text-primary">Giới hạn file</strong> 2MB (413 nếu vượt). Nhật ký import ghi <code>importType = &quot;AUTO&quot;</code>, <code>importedBy = &quot;Python Script (Auto Import)&quot;</code>.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
