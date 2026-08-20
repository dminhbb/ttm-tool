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
          <h3 className="ui-card-title mb-1">1. Phân tách màn hình Quản trị Epic (rút gọn) và (đầy đủ)</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Quản trị Epic (rút gọn) (/epic-alerts)</strong> — theo dõi tổng quan các cột Design, In Progress, Ready4Golive và Release theo mốc chuẩn 30 ngày (Epic phức tạp) hoặc 15 ngày (Epic đơn giản). Chỉ dành cho <strong className="text-fb-text-primary">ADMIN/SUPERADMIN</strong>.</li>
            <li><strong className="text-fb-text-primary">Quản trị Epic (đầy đủ) (/epic-alerts-15)</strong> — theo dõi chi tiết theo 5 pha: Design (20%), Dev (50%), Test (80%), Pentest (90%), R4Golive (100%). Mốc thời gian mỗi pha tính tự động theo tỷ lệ % TTM-CNTT tích lũy. Mở cho <strong className="text-fb-text-primary">mọi user đã đăng nhập</strong> (theo phạm vi dự án được phân quyền).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">2. Hai lớp cảnh báo trên màn hình</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Cột Nhận xét</strong> — mức cảnh báo tổng thể của Epic (Cảnh báo sớm / Cảnh báo muộn / Fail TTM-CNTT), tính theo tiêu chí Time to Market (TTM-CNTT) đang active cho loại Epic đó, so R4G Date (hoặc Target) với mốc chuẩn.</li>
            <li><strong className="text-fb-text-primary">Các cột Trạng thái/Pha</strong> — cảnh báo theo từng trạng thái cụ thể trong quy trình Epic, dựa trên rule cấu hình tại &quot;Cấu hình cảnh báo&quot; (mốc sớm/muộn theo Loại Epic × Trạng thái).</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-2">3. Mốc thời gian khuyến nghị cho một trạng thái</h3>
          <AlertTimelineDiagram />
          <p className="mt-2 text-xs">
            <code>Target = addWorkingDays(T1, offset &quot;cảnh báo muộn&quot;)</code> — tính bằng ngày làm việc (bỏ qua Thứ Bảy, Chủ Nhật và các ngày nghỉ được cấu hình tại &quot;Cấu hình ngày nghỉ&quot;).
          </p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Quy tắc hiển thị từng ô trạng thái (TTM-CNTT-1…6)</h3>
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
          <h3 className="ui-card-title mb-1">5. Badge &quot;Đạt TTM&quot; &amp; Lịch sử cảnh báo tích lũy</h3>
          <p>Badge <strong>&quot;Đạt TTM&quot;</strong> hiển thị ở cột Nhận xét khi Epic đã có R4G Date và không bị cảnh báo. Icon tam giác vàng ở cột Epic cho phép mở popup <strong className="text-fb-text-primary">Epic History</strong> để tra cứu toàn bộ lịch sử cảnh báo muộn/fail qua các đợt import dữ liệu.</p>
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
              <tr><td>epic_alert_history</td><td>Tích lũy các lần Epic bị Cảnh báo muộn/Fail TTM, kèm ngày và status lúc đó</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
              <tr><td>epic_milestone_history</td><td>Lịch sử mốc DESIGN_DONE/DEV_DONE/TEST_DONE phục vụ Quản lý Epic 15</td><td><strong className="text-fb-text-primary">Giữ lại</strong></td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">4. Quản lý lớp dữ liệu tổng hợp &amp; Sao lưu/Phục hồi</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong className="text-fb-text-primary">Nhật ký lớp dữ liệu tổng hợp (Epic)</strong> (trang Nguồn dữ liệu, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>): có thể <strong className="text-fb-text-primary">Xóa</strong> (chỉ xóa 4 bảng tổng hợp/hậu-tổng hợp ở trên, bảo toàn raw) hoặc <strong className="text-fb-text-primary">Chạy lại</strong> (tính lại từ <code>issues</code> hiện có mà không cần re-import CSV).</li>
            <li><strong className="text-fb-text-primary">Xóa N lớp dữ liệu gần nhất</strong> (cùng trang, chỉ <strong className="text-fb-text-primary">SUPERADMIN</strong>): thao tác mạnh hơn — xóa <em>cả raw lẫn tổng hợp</em> của N ngày import gần nhất (tính theo union ngày của mọi bảng liên quan), dùng khi cần loại bỏ hẳn một đợt dữ liệu lỗi thay vì chỉ tính lại.</li>
            <li><strong className="text-fb-text-primary">Sao lưu / Phục hồi dữ liệu (/admin/database)</strong>: Export/Import dạng file SQL dump cho một danh sách bảng cố định (master data, user, dự án, ngày nghỉ, rule cảnh báo, <code>import_batches</code>/<code>import_rows</code>, <code>issues</code>, <code>epic_ttm_snapshots</code>, audit log). <strong className="text-fb-text-primary">Chưa bao gồm</strong> <code>issue_daily_snapshots</code>, <code>epic_alert_history</code>, <code>epic_milestone_history</code> — 3 bảng này hiện không nằm trong phạm vi sao lưu/phục hồi.</li>
          </ul>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">5. Màn hình Cảnh báo Epic lấy dữ liệu từ đâu?</h3>
          <p>API <code>GET /api/epic-alerts</code> KHÔNG đọc dữ liệu đã tổng hợp sẵn. Mỗi lần load, hệ thống lấy dòng <code>issues</code> mới nhất của từng Epic (theo <code>aggregated_at</code> lớn nhất, không giới hạn theo 1 batch cụ thể) rồi tính lại toàn bộ cảnh báo tại thời điểm request bằng rule đang active. <code>epic_alert_history</code> chỉ dùng để: (a) hiện icon/lịch sử cảnh báo, (b) quyết định Epic status = Released có còn hiển thị hay không.</p>
        </section>

        <section>
          <h3 className="ui-card-title mb-1">6. API import dữ liệu tự động (cho script Python)</h3>
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
