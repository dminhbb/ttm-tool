'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Timeline diagram: T1 → mốc sớm → mốc muộn (Target), 3 zones matching the epic-alerts stage-cell colors. */
function AlertTimelineDiagram() {
  return (
    <svg viewBox="0 0 640 150" role="img" aria-label="Sơ đồ mốc thời gian cảnh báo Epic" className="w-full">
      <line x1="40" y1="70" x2="600" y2="70" stroke="#c7ccd6" strokeWidth="2" />
      <rect x="40" y="60" width="180" height="20" fill="#eef1f7" />
      <rect x="220" y="60" width="140" height="20" fill="#fff4cf" />
      <rect x="360" y="60" width="240" height="20" fill="#fdeaea" />

      <circle cx="40" cy="70" r="6" fill="#2f5bd6" />
      <text x="40" y="40" fontSize="12" fontWeight="700" textAnchor="middle" fill="#1f2430">T1 (Start Date)</text>

      <circle cx="220" cy="70" r="6" fill="#b77900" />
      <text x="220" y="40" fontSize="12" fontWeight="700" textAnchor="middle" fill="#1f2430">Mốc cảnh báo sớm</text>
      <text x="220" y="110" fontSize="10.5" textAnchor="middle" fill="#6b7280">TTM-CNTT-3: badge &quot;Cảnh báo sớm&quot;</text>

      <circle cx="360" cy="70" r="6" fill="#c62828" />
      <text x="360" y="40" fontSize="12" fontWeight="700" textAnchor="middle" fill="#1f2430">Mốc cảnh báo muộn (Target)</text>
      <text x="360" y="110" fontSize="10.5" textAnchor="middle" fill="#6b7280">TTM-CNTT-4/5: badge &quot;Cảnh báo muộn&quot;</text>

      <text x="130" y="95" fontSize="10.5" textAnchor="middle" fill="#6b7280">TTM-CNTT-1/2: &quot;Target: dd/mm/yyyy&quot;</text>
      <text x="480" y="95" fontSize="10.5" textAnchor="middle" fill="#6b7280">Vẫn &quot;Cảnh báo muộn&quot; cho tới khi qua status</text>

      <rect x="360" y="118" width="14" height="14" fill="#e6f4ea" stroke="#cfe8d6" />
      <text x="382" y="129" fontSize="10.5" fill="#6b7280">Khi status Epic đã đi qua cột này → hiển thị icon hoàn thành (Pass), không phụ thuộc mốc ngày.</text>
    </svg>
  );
}

export function AlertLogicModal({ isOpen, onClose }: HelpPanelProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Logic cảnh báo Epic" maxWidth="xl" footer={<Button variant="outline" onClick={onClose}>Đóng</Button>}>
      <div className="flex flex-col gap-5 text-fb-text-secondary">
        <section>
          <h3 className="ui-card-title mb-1">1. Hai lớp cảnh báo trên màn hình Epic của tôi</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Cột Nhận xét</strong> — mức cảnh báo tổng thể của Epic (Cảnh báo sớm / Cảnh báo muộn / Fail TTM-CNTT), tính theo tiêu chí Time to Market (TTM-CNTT) đang active cho loại Epic đó, so R4G Date (hoặc Target) với mốc chuẩn.</li>
            <li><strong className="text-fb-text-primary">Các cột Design / In Progress / Ready4Golive</strong> — cảnh báo theo từng trạng thái cụ thể trong quy trình Epic, dựa trên rule cấu hình tại &quot;Cấu hình cảnh báo&quot; (mốc sớm/muộn theo Loại Epic × Trạng thái).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">2. Mốc thời gian khuyến nghị cho một trạng thái</h3>
          <AlertTimelineDiagram />
          <p className="mt-2 text-xs">
            <code>Target = addWorkingDays(T1, offset &quot;cảnh báo muộn&quot;)</code> — tính bằng ngày làm việc (bỏ qua Thứ Bảy, Chủ Nhật và ngày nghỉ cấu hình).
          </p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">3. Quy tắc hiển thị từng ô trạng thái (TTM-CNTT-1…6)</h3>
          <table className="ui-table w-full text-xs">
            <thead>
              <tr><th className="text-left">Rule</th><th className="text-left">Điều kiện</th><th className="text-left">Hiển thị</th></tr>
            </thead>
            <tbody>
              <tr><td>TTM-CNTT-1/2</td><td>Status Epic ở trước hoặc đúng cột, chưa tới/chưa qua mốc muộn</td><td>Text &quot;Target: dd/mm/yyyy&quot; (hoặc &quot;Past target&quot; nếu đã qua mốc sớm mà chưa tới trạng thái)</td></tr>
              <tr><td>TTM-CNTT-3</td><td>Đúng ngày mốc sớm, status Epic = status của cột</td><td>Badge &quot;Cảnh báo sớm&quot; (light orange)</td></tr>
              <tr><td>TTM-CNTT-4/5</td><td>Từ ngày mốc muộn trở đi, status Epic = status của cột</td><td>Badge &quot;Cảnh báo muộn&quot; (light red)</td></tr>
              <tr><td>TTM-CNTT-6</td><td>Status Epic đã đi qua status của cột</td><td>Icon hoàn thành (Pass) — cột Ready4Golive hiện ngày R4G Date thực tế nếu có</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Badge &quot;Đạt TTM&quot;</h3>
          <p>Hiển thị ở cột Nhận xét khi Epic đã có R4G Date và không bị cảnh báo (đạt tiêu chí TTM-CNTT đúng hạn theo rule).</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">5. Dữ liệu luôn tính lại theo thời gian thực</h3>
          <p>Mọi cảnh báo trên màn hình được tính lại tại thời điểm bạn mở trang (không phải đóng băng theo lần import gần nhất), dựa trên dữ liệu Epic mới nhất và cấu hình rule hiện hành. Riêng icon tam giác vàng ở cột Epic mở ra <strong className="text-fb-text-primary">lịch sử cảnh báo</strong> — các lần Epic từng bị &quot;Cảnh báo muộn&quot;/&quot;Fail TTM&quot; theo đúng ngày import, được lưu tích lũy để tra cứu.</p>
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
      {box(360, 110, 140, 50, 'aggregateBatchData()', 'Chạy khi import & khi "Chạy lại"')}

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
          <h3 className="ui-card-title mb-1">3. Các bảng dữ liệu</h3>
          <table className="ui-table w-full text-xs">
            <thead><tr><th className="text-left">Bảng</th><th className="text-left">Vai trò</th><th className="text-left">Khi raw batch bị xóa</th></tr></thead>
            <tbody>
              <tr><td>import_batches / import_rows</td><td>Dữ liệu raw của từng đợt import</td><td>Bị xóa (đây chính là raw)</td></tr>
              <tr><td>issues</td><td>Dữ liệu Epic/Story/Subtask canonical, 1 dòng/issue/batch</td><td>Cascade xóa theo batch</td></tr>
              <tr><td>epic_ttm_snapshots</td><td>Lịch sử gọn theo Epic, phục vụ tra cứu dài hạn</td><td><strong className="text-fb-text-primary">Giữ lại</strong> (source_import_batch_id → NULL)</td></tr>
              <tr><td>issue_daily_snapshots</td><td>Lịch sử gọn theo ngày cho mọi cấp (Epic/Story/Subtask)</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_alert_history</td><td>Tích lũy các lần Epic bị Cảnh báo muộn/Fail TTM, kèm ngày và status lúc đó</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Màn hình Epic Alerts lấy dữ liệu từ đâu?</h3>
          <p>API <code>GET /api/epic-alerts</code> KHÔNG đọc dữ liệu đã tổng hợp sẵn. Mỗi lần load, hệ thống lấy dòng <code>issues</code> mới nhất của từng Epic (theo <code>aggregated_at</code> lớn nhất, không giới hạn theo 1 batch cụ thể) rồi tính lại toàn bộ cảnh báo tại thời điểm request bằng rule đang active. <code>epic_alert_history</code> chỉ dùng để: (a) hiện icon/lịch sử cảnh báo, (b) quyết định Epic status = Released có còn hiển thị hay không.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">5. Quản lý lớp dữ liệu tổng hợp</h3>
          <p>Tại &quot;Nguồn dữ liệu&quot; → panel &quot;Nhật ký lớp dữ liệu tổng hợp (Epic)&quot;: có thể <strong className="text-fb-text-primary">Xóa</strong> (chỉ xóa 3 bảng tổng hợp, không đụng raw) hoặc <strong className="text-fb-text-primary">Chạy lại</strong> (tính lại từ <code>issues</code> hiện có, không cần import lại CSV — chỉ khả dụng khi raw của ngày đó còn tồn tại).</p>
        </section>
      </div>
    </Modal>
  );
}
