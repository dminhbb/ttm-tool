'use client';

import { Warning } from '@phosphor-icons/react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { BADGE_LIST, FINDING_GROUPS, INDEX_MEMBERSHIP_RULES, INDEX_PERCENT_FORMULA, SCORING_AXES, SUPPRESSIONS, badgesOf } from '@/lib/scoring/catalog';
import type { BadgeDefinition, FindingGroup } from '@/lib/scoring/catalog';

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
  return (
    <Modal icon={Warning} isOpen={isOpen} onClose={onClose} title="Logic cảnh báo Epic — Scoring Service" maxWidth="3xl" footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}>
      <div className="flex flex-col gap-6 text-sm text-fb-text-secondary">
        <section className="rounded-md border border-status-warning/30 bg-status-warning-soft px-3 py-2 text-xs text-fb-text-primary">
          <strong>Scoring Service.</strong> Mọi Epic được chấm điểm lại mỗi lần tạo cache và được đối chiếu với logic cũ (Quản trị nguồn dữ liệu →
          Đối chiếu Scoring Service). SUPERADMIN chọn các màn hình hiển thị theo Scoring Service hay logic cũ tại đó; màn &quot;Quản trị Epic (rút gọn)&quot; luôn dùng logic cũ.
          Ở chế độ Scoring Service, cột Nhận xét hiện thêm &quot;Sai Status (Release)&quot;, &quot;Pending lâu&quot; và &quot;Khuyến nghị (n)&quot;.
        </section>

        <section>
          <h3 className="ui-card-title mb-1">1. Nguyên tắc</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>Mọi rule nằm trong <strong className="text-fb-text-primary">1 Scoring Service duy nhất</strong>. Đầu vào là dữ liệu 1 Epic và mốc <code>asOf</code>; đầu ra là <strong className="text-fb-text-primary">danh sách finding</strong>, mỗi finding gắn đúng 1 badge.</li>
            <li>Mỗi badge thuộc <strong className="text-fb-text-primary">đúng 1 Axis</strong> và <strong className="text-fb-text-primary">đúng 1 Finding Group</strong>. Một Epic có thể có nhiều badge cùng lúc trên nhiều axis; màn hình tự chọn badge cần hiển thị.</li>
            <li><code>asOf</code> là mốc &quot;hôm nay&quot; tương đối theo giờ Việt Nam: bằng hôm nay khi xem hiện tại, bằng ngày của lớp dữ liệu khi xem quá khứ. Dữ liệu Epic và story/subtask đều lấy tại <code>asOf</code>.</li>
            <li>Tham số (offset, thời hạn grace, khoảng ngày, tỉ lệ…) và việc bật/tắt từng rule lấy từ cấu hình trong DB; logic nằm trong code.</li>
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
                <tr><th className="text-left">Badge</th><th className="text-left">Group</th><th className="text-left">Ý nghĩa</th><th className="text-left">Công thức</th><th className="text-left">Tương ứng logic cũ</th></tr>
              </thead>
              <tbody>
                {SCORING_AXES.flatMap((axis) => [
                  <tr key={axis.id}><td colSpan={5} className="bg-fb-surface-muted font-semibold text-fb-text-primary">{axis.label}</td></tr>,
                  ...BADGE_LIST.filter((badge) => badge.axis === axis.id).sort((a, b) => a.precedence - b.precedence).map((badge) => (
                    <tr key={badge.id}>
                      <td className="align-top"><BadgeChip badge={badge} /></td>
                      <td className="align-top"><GroupChip group={badge.group} /></td>
                      <td className="align-top">{badge.meaning}</td>
                      <td className="align-top"><code className="whitespace-pre-wrap text-[11px]">{badge.formula}</code></td>
                      <td className="align-top text-[11px]">{badge.legacySource ?? <em>Mới</em>}</td>
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
          <h3 className="ui-card-title mb-1">7. Chỉ số TTM-CNTT (QLDA) / TTM-CNTT (QA)</h3>
          <p className="text-xs">Chỉ số chỉ đếm các cờ dưới đây (không phải badge), nên &quot;Đạt&quot; của chỉ số luôn trùng với badge &quot;Đạt TTM-CNTT (QLDA)&quot;. Nếu không nói rõ khác, chỉ số tính trên đúng các Epic đang hiển thị trong bảng của màn hình (theo bộ lọc); riêng 2 widget cố định trên banner TTM dashboard tính trên toàn bộ Epic trong ứng dụng.</p>
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
          <h3 className="ui-card-title mb-1">8. Thay đổi so với logic hiện tại (đã chốt 29/09/2026)</h3>
          <ul className="ml-5 list-disc space-y-1 text-xs">
            <li><strong className="text-fb-text-primary">Bỏ &quot;Cảnh báo sớm&quot;</strong> ở cả TTM-CNTT (QLDA), trục Release và cột pha. Offset &quot;sớm&quot; trong Cấu hình cảnh báo không còn được dùng. Trường hợp trục Release trước đây hiện &quot;Cảnh báo sớm&quot; (status đã qua R4GOLIVE, chưa có Due Date, còn trong hạn) nay không hiện badge nào cho tới khi quá hạn thành &quot;Giải trình Golive&quot;.</li>
            <li><strong className="text-fb-text-primary">Sai lệch dữ liệu được xét trước</strong> (01/10/2026): Epic có Sai lệch dữ liệu (R1, R3–R6, R8, R9, R10) không được chấm Đạt / Fail / Cảnh báo muộn / Sai Status trên TTM-CNTT (QLDA), TTM-CNTT (QA) và TTM-E2E — chỉ hiện Sai lệch dữ liệu cho tới khi dữ liệu được sửa.</li>
            <li><strong className="text-fb-text-primary">&quot;Sai Status&quot;</strong> (TTM-CNTT (QLDA) và TTM-E2E, nhóm Khuyến nghị): ngày ghi nhận đúng hạn và đã tới nhưng status chưa lên R4GOLIVE — Epic <strong>vẫn được tính Đạt</strong>, badge &quot;Sai Status&quot; hiện kèm. Ngày R4G ở tương lai không được tính Đạt (từ 09/10/2026 là Sai lệch dữ liệu). Từ 04/10/2026, Epic có R4G Date mà status chưa lên R4GOLIVE là Sai lệch dữ liệu (R8) nên trường hợp này chỉ còn xảy ra khi rule R8 bị tắt.</li>
            <li><strong className="text-fb-text-primary">Công thức TTM-CNTT (QLDA) / (QA)</strong> (04/10/2026): Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba) — Epic Đạt trên tổng Epic đã có kết luận (Đạt, Fail có R4G Date muộn hơn Target, Fail chưa có R4G Date đã quá Target). Trước đây mẫu số là mọi Epic có R4G Date (gồm cả R4G tương lai) và không tính Epic Fail chưa có R4G Date. TTM-CNTT (QA) dùng cùng công thức, chỉ lấy Epic MVP Done / Released. Tên các tiêu chí L01…L05bb xem ở TTM Dashboard 2.</li>
            <li><strong className="text-fb-text-primary">Chất lượng dữ liệu</strong> (04/10/2026): thêm <strong>R8</strong> (có R4G Date nhưng status &lt; R4GOLIVE) và <strong>R9</strong> (status ≥ R4GOLIVE nhưng chưa có R4G Date); <strong>R1</strong> &quot;Thiếu Start Date&quot; tính từ status DESIGN (trước đây từ DEV); <strong>R5</strong> &quot;Thiếu Requirement Level&quot; chỉ tính khi status đã qua DESIGN.</li>
            <li><strong className="text-fb-text-primary">Epic ngoại lệ không được xét</strong> (09/10/2026): &quot;Epic ngoại lệ&quot; là tên gọi chung của Epic trong danh sách Black listed và Epic thuộc dự án có Time to Market = N. Scoring Service không chạy rule nào cho các Epic này — không có Sai lệch dữ liệu, Đạt / Fail, Cảnh báo, Chờ / Giải trình golive, trễ pha hay khuyến nghị — chỉ ghi nhận badge &quot;Epic ngoại lệ (Black listed)&quot; hoặc &quot;Epic ngoại lệ (dự án TTM = N)&quot; ở axis Phạm vi (kèm &quot;Ngoài phạm vi&quot; nếu có). Chúng không tính vào chỉ số nào và không tính vào bất kỳ widget nào của TTM Dashboard 2.</li>
            <li><strong className="text-fb-text-primary">R4G Date không được khai báo trước</strong> (09/10/2026, quy định của công ty): mọi Epic có R4G Date còn ở tương lai là Sai lệch dữ liệu, chỉ trừ Cancelled — status chưa tới R4GOLIVE là <strong>R8</strong> (từ 08/10/2026), status từ R4GOLIVE trở lên hoặc Reopened là <strong>R10</strong> &quot;R4G Date ở tương lai&quot; (mới). Epic owner xoá giá trị khỏi trường R4G Date và ghi ngày dự kiến ở một trường thông tin phụ khác. Các Epic này không được chấm Đạt / Fail và nằm ngoài mẫu số; nhóm &quot;chưa kết luận&quot; (L05ac) chỉ còn Epic không tính được Target.</li>
            <li><strong className="text-fb-text-primary">TTM-E2E</strong> (01/10/2026): <code>Target_E2E = T0 +wd (N_E2E − 1)</code>; Đạt không còn yêu cầu status Released; Fail khi ngày kết thúc &gt; Target, hoặc chưa có ngày kết thúc mà đã quá Target.</li>
            <li><strong className="text-fb-text-primary">R7 thành &quot;Sai Status&quot; (Release)</strong> thuộc nhóm Khuyến nghị: Epic chỉ vi phạm R7 không còn bị đánh dấu &quot;Sai lệch dữ liệu&quot; (không bị đẩy xuống cuối bảng) và được tính vào mẫu số TTM-CNTT (QLDA).</li>
            <li><strong className="text-fb-text-primary">R2 &quot;Pending lâu&quot;</strong> thuộc nhóm Khuyến nghị, không còn bị đánh dấu &quot;Sai lệch dữ liệu&quot;.</li>
            <li><strong className="text-fb-text-primary">Hoàn thành pha theo asOf</strong>: khi xem lớp dữ liệu cũ, trạng thái story/subtask được lấy tại ngày đó thay vì hôm nay.</li>
            <li><strong className="text-fb-text-primary">Mốc Target_CNTT thống nhất</strong> = <code>T1 +wd (N_CNTT − 1)</code> cho mọi badge (Fail, Cảnh báo muộn, Sai Status, Đạt, Phạm vi) — logic cũ dùng <code>T1 +wd N_CNTT</code> cho badge nên Fail sớm hơn tối đa 1 ngày làm việc.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}

/** Box-and-arrow diagram of the end-to-end data pipeline: import → canonical issues → aggregated layers → live screen compute. */
function DataPipelineDiagram() {
  const box = (x: number, y: number, w: number, h: number, label: string, sub?: string, fill = '#eaf0ff', stroke = '#c3cce3') => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)} fontSize="11.5" fontWeight="700" textAnchor="middle" fill="#1f2430">{label}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} fontSize="9.5" textAnchor="middle" fill="#6b7280">{sub}</text>}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a93a6" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
  );
  return (
    <svg viewBox="0 0 900 260" role="img" aria-label="Sơ đồ luồng xử lý dữ liệu Epic" className="w-full">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#8a93a6" />
        </marker>
      </defs>

      {box(20, 20, 140, 50, 'File CSV (Jira)', 'Chỉ issue update trong ngày')}
      {arrow(160, 45, 190, 45)}
      {box(190, 20, 140, 50, 'import_rows', 'Raw, kèm validation')}
      {arrow(330, 45, 360, 45)}
      {box(360, 20, 140, 50, 'issues', 'Canonical, upsert theo batch')}

      {arrow(430, 70, 430, 110)}
      {box(360, 110, 140, 50, 'aggregateBatchData()', 'Chạy khi import, "Chạy lại" & "Hoàn thiện dữ liệu"')}

      {arrow(360, 135, 190, 135)}
      {box(20, 110, 140, 50, 'epic_ttm_snapshots', 'Lịch sử Epic gọn')}
      {arrow(500, 135, 530, 135)}
      {box(530, 110, 170, 50, 'issue_daily_snapshots', 'Lịch sử mọi cấp')}
      {arrow(430, 160, 430, 190)}
      {box(360, 190, 140, 50, 'epic_alert_history', 'Chỉ lưu khi LATE/FAIL')}

      {box(700, 90, 180, 90, 'Màn hình Epic Alerts', 'Đọc issues mới nhất mỗi Epic\n+ tính lại cảnh báo real-time', '#e6f4ea', '#cfe8d6')}
      {arrow(500, 45, 700, 100)}
      {arrow(500, 215, 700, 150)}
    </svg>
  );
}

export function DataLogicModal({ isOpen, onClose }: HelpPanelProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Logic xử lý dữ liệu (Admin)" maxWidth="xl" footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}>
      <div className="flex flex-col gap-5 text-fb-text-secondary">
        <section>
          <h3 className="ui-card-title mb-1">1. Mô hình import theo lớp dữ liệu hàng ngày</h3>
          <p>Mỗi lần import là 1 lớp dữ liệu (data layer), gắn với <code>aggregated_at</code>. File CSV chỉ chứa các issue có trường <em>updated</em> trong đúng ngày import — không phải full snapshot toàn bộ dữ liệu.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">2. Luồng xử lý end-to-end</h3>
          <DataPipelineDiagram />
        </section>

        <section>
          <h3 className="ui-card-title mb-1">3. Các bảng dữ liệu trong CSDL</h3>
          <table className="ui-table w-full text-xs">
            <thead><tr><th className="text-left">Bảng</th><th className="text-left">Vai trò</th><th className="text-left">Khi raw batch bị xóa</th></tr></thead>
            <tbody>
              <tr><td>import_batches / import_rows</td><td>Dữ liệu raw của từng đợt import CSV</td><td>Bị xóa (đây chính là dữ liệu raw)</td></tr>
              <tr><td>issues</td><td>Dữ liệu Epic/Story/Subtask canonical, 1 dòng/issue/batch</td><td>Cascade xóa theo batch</td></tr>
              <tr><td>epic_ttm_snapshots</td><td>Lịch sử gọn theo Epic, phục vụ tra cứu dài hạn</td><td><strong className="text-fb-text-primary">Giữ lại</strong> (source_import_batch_id → NULL)</td></tr>
              <tr><td>issue_daily_snapshots</td><td>Lịch sử gọn theo ngày cho mọi cấp (Epic/Story/Subtask)</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_alert_history</td><td>Tích lũy các lần Epic bị Cảnh báo muộn/Fail TTM-CNTT (QLDA) tổng thể (ghi tại thời điểm import), kèm ngày và status lúc đó. Cảnh báo <strong>theo từng pha</strong> (DEV/TEST/PENTEST của Epic 15) cũng ghi vào bảng này nhưng <strong className="text-fb-text-primary">đang tạm tắt</strong> (xem mục 5).</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_alert_timeline</td><td>Theo dõi 5 loại cảnh báo (Fail TTM-CNTT (QLDA), Cảnh báo muộn TTM-CNTT (QLDA), Fail TTM-E2E, Thiếu Start Date, Sai lệch dữ liệu) dưới dạng các &quot;đợt&quot; có ngày bắt đầu/kết thúc liên tục — phục vụ mục &quot;Dòng thời gian cảnh báo&quot; trong popup Epic History. Luôn ghi ở mỗi lần <code>aggregateBatchData()</code> chạy (không tạm tắt như 2 dòng dưới).</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_data_anomaly_violations</td><td>Trạng thái hiện tại (không phải lịch sử &quot;đợt&quot;) của từng rule R1-R6 &quot;Sai lệch dữ liệu&quot; đang vi phạm trên mỗi Epic — 1 dòng/Epic/rule, ghi đè hoặc xoá ở mỗi lần <code>aggregateBatchData()</code> chạy. Phục vụ thống kê số Epic vi phạm theo từng nhóm rule; badge trên UI vẫn tính live, không đọc bảng này.</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_milestone_history</td><td>Lịch sử mốc DESIGN_DONE/DEV_DONE/TEST_DONE — bảng vẫn tồn tại nhưng việc ghi mới <strong className="text-fb-text-primary">đang tạm tắt</strong>; trạng thái hoàn thành từng pha của Epic 15 hiện tính <strong>live</strong> từ status Story/Subtask hiện tại (xem mục 5), không đọc bảng này.</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Validate khi import — dữ liệu bất thường không còn bị chặn</h3>
          <p>
            Rule ngày sai thứ tự (ví dụ R4G Date sớm hơn Start Date, Due Date sớm hơn T0) <strong className="text-fb-text-primary">trước kia chặn import</strong>
            (dòng bị loại hoàn toàn khỏi <code>issues</code>), nay chỉ còn ở mức <strong className="text-fb-text-primary">cảnh báo (WARNING)</strong> ngay lúc import
            và <strong>vẫn được ghi vào <code>issues</code></strong> — để user chủ động nhận biết và làm sạch dữ liệu trên Jira thay vì Epic bị âm thầm biến mất khỏi hệ thống.
          </p>
          <p>
            Ở tầng đọc (mỗi lần tải màn hình), hàm dùng chung <code>evaluateEpicDataAnomaly()</code> đánh giá lại đầy đủ <strong>7 rule (R1-R7)</strong> — không chỉ riêng
            ngày sai thứ tự, mà cả thiếu T1 theo trạng thái, Pending quá lâu, thiếu Phân loại yêu cầu/Requirement Level, SP nhưng mức thấp, Due Date đúng hạn nhưng status chưa Released (chi tiết ở popup &quot;Logic cảnh báo
            Epic&quot;) — để gắn badge <strong className="text-fb-text-primary">&quot;Sai lệch dữ liệu&quot;</strong>, nhóm cuối bảng và highlight trên mọi
            màn hình Epic Alerts/Báo cáo/Dashboard. Mỗi vi phạm còn được ghi vào bảng <code>epic_data_anomaly_violations</code> (xem mục 3) để thống kê riêng theo
            từng nhóm rule. Màn hình Nguồn dữ liệu vẫn chỉ hiện đúng badge &quot;Cảnh báo&quot; (không còn &quot;Lỗi&quot;) kèm message chi
            tiết cho các dòng ngày sai thứ tự lúc import.
          </p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">5. Quản lý lớp dữ liệu tổng hợp &amp; Sao lưu/Phục hồi</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Nhật ký lớp dữ liệu tổng hợp (Epic)</strong> (trang Nguồn dữ liệu, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>): có thể <strong className="text-fb-text-primary">Xóa</strong> (chỉ xóa 4 bảng tổng hợp/hậu-tổng hợp ở trên, bảo toàn raw) hoặc <strong className="text-fb-text-primary">Chạy lại</strong> (tính lại từ <code>issues</code> hiện có mà không cần re-import CSV).</li>
            <li><strong className="text-fb-text-primary">Xóa N lớp dữ liệu gần nhất</strong> (cùng trang, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>): thao tác mạnh hơn — xóa <em>cả raw lẫn tổng hợp</em> của N ngày import gần nhất (tính theo union ngày của mọi bảng liên quan), dùng khi cần loại bỏ hẳn một đợt dữ liệu lỗi thay vì chỉ tính lại.</li>
            <li><strong className="text-fb-text-primary">Sao lưu / Phục hồi dữ liệu (/admin/database)</strong>: Export/Import dạng file SQL dump cho một danh sách bảng cố định (master data, user, dự án, ngày nghỉ, rule cảnh báo, <code>import_batches</code>/<code>import_rows</code>, <code>issues</code>, <code>epic_ttm_snapshots</code>, audit log). <strong className="text-fb-text-primary">Chưa bao gồm</strong> <code>issue_daily_snapshots</code>, <code>epic_alert_history</code>, <code>epic_milestone_history</code> — 3 bảng này hiện không nằm trong phạm vi sao lưu/phục hồi.</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">6. Các màn hình Epic Alerts lấy dữ liệu từ đâu?</h3>
          <p>Cả 4 màn hình (rút gọn/đầy đủ/Epic in PO/Dashboard) đều <strong>KHÔNG đọc dữ liệu đã tổng hợp sẵn</strong>. Mỗi lần load, hệ thống lấy dòng <code>issues</code> mới nhất của từng Epic (theo <code>aggregated_at</code> lớn nhất, không giới hạn theo 1 batch cụ thể) rồi tính lại toàn bộ cảnh báo — kể cả Fail TTM-E2E và cờ dữ liệu bất thường — tại thời điểm request bằng rule đang active. <code>epic_alert_history</code> chỉ dùng để: (a) hiện icon/lịch sử cảnh báo tổng thể, (b) quyết định Epic status = Released có còn hiển thị trên màn &quot;rút gọn&quot; hay không.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">7. API import dữ liệu tự động (cho script Python)</h3>
          <p>Ngoài form upload trên màn hình Nguồn dữ liệu (xác thực bằng session, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>), hệ thống có thêm 1 endpoint riêng để script export Jira của bạn tự động gọi ngay sau khi xuất xong file — dùng chung pipeline <code>processImport()</code>, cùng định dạng CSV/adapter <code>PY_JIRA_API</code>, không đổi gì ở logic parse/validate so với import thủ công.</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Endpoint riêng</strong>: <code>POST /api/data-source/import/auto</code> — tách hoàn toàn khỏi route UI (<code>/api/data-source/import</code> vẫn giữ nguyên session + SUPERADMIN).</li>
            <li><strong className="text-fb-text-primary">Xác thực bằng token</strong>: gửi header <code>Authorization: Bearer &lt;token&gt;</code>, so khớp với biến môi trường <code>IMPORT_API_TOKEN</code> bằng SHA-256 hash + so sánh constant-time (tránh timing attack). Bạn tự tạo token và khai báo — hệ thống không tự sinh giá trị thật, chỉ có chỗ khai báo mẫu trong <code>.env.example</code>.</li>
            <li><strong className="text-fb-text-primary">aggregatedAt</strong>: luôn lấy <code>new Date()</code> tại đúng thời điểm API được gọi — script không cần truyền, hệ thống cũng không đoán từ tên file.</li>
            <li><strong className="text-fb-text-primary">Response</strong>: dùng nguyên contract JSON hiện có của <code>processImport()</code> (<code>successRows</code>/<code>warningRows</code>/<code>errorRows</code>) để script log/cảnh báo khi import có lỗi.</li>
            <li><strong className="text-fb-text-primary">Giới hạn file</strong>: chặn ở 2MB (413 nếu vượt) — chỉ là lớp phòng thủ, dư dả so với các file export thực tế (thường dưới 500KB).</li>
            <li><strong className="text-fb-text-primary">Phân biệt trong nhật ký import</strong>: các đợt import qua API này được gắn <code>importType = &quot;AUTO&quot;</code>, <code>importedBy = &quot;Python Script (Auto Import)&quot;</code> (khác với <code>&quot;MANUAL&quot;</code>/<code>&quot;System&quot;</code> của upload thủ công) để dễ tra soát &quot;Nhật ký lịch sử import&quot;.</li>
          </ul>
          <p className="mt-2"><strong className="text-fb-text-primary">Các bước cần làm để dùng được:</strong></p>
          <ol className="ml-5 list-decimal space-y-1">
            <li>Tạo token (ví dụ <code>openssl rand -hex 32</code>), thêm vào <code>.env.local</code>: <code>IMPORT_API_TOKEN=&lt;giá trị&gt;</code> — và biến môi trường tương ứng trên Vercel (production) nếu muốn script gọi cả vào production.</li>
            <li>Restart server (<code>npm run dev</code>/deploy lại) — biến môi trường mới chỉ được đọc lúc server khởi động.</li>
            <li>Script Python gọi: <code>POST http://&lt;host&gt;/api/data-source/import/auto</code>, header <code>Authorization: Bearer &lt;token&gt;</code>, body <code>multipart/form-data</code> với field <code>file</code> = file CSV export.</li>
          </ol>
        </section>
      </div>
    </Modal>
  );
}
