/* ============================================================================
   MB Mockup — Dữ liệu mẫu tập trung cho toàn bộ module Quản lý dự án
   Mốc thời gian dữ liệu: tháng 10/2026. State sống trong session của từng trang.
   ========================================================================== */

const MBData = (function () {

  /* ============================== CHECKLIST TEMPLATE (dùng chung MB) ===== */
  const PHASES = [
    { key: 'KHOI_TAO', name: 'Khởi tạo', icon: 'flag' },
    { key: 'PHAN_TICH', name: 'Phân tích & thiết kế', icon: 'compass-tool' },
    { key: 'PHAT_TRIEN', name: 'Phát triển', icon: 'code' },
    { key: 'KIEM_THU', name: 'Kiểm thử', icon: 'test-tube' },
    { key: 'GOLIVE', name: 'Go-live', icon: 'rocket-launch' },
    { key: 'HAU_GOLIVE', name: 'Hậu go-live', icon: 'seal-check' }
  ];

  const CHECKLIST_TEMPLATE = [
    { id: 'CK01', phase: 'KHOI_TAO', name: 'Phê duyệt chủ trương/đề xuất dự án', deliverable: 'Tờ trình phê duyệt' },
    { id: 'CK02', phase: 'KHOI_TAO', name: 'Thành lập tổ dự án và phân vai trách nhiệm', deliverable: 'Quyết định thành lập' },
    { id: 'CK03', phase: 'KHOI_TAO', name: 'Đăng ký OKR và chỉ tiêu hiệu quả', deliverable: 'Bản đăng ký OKR' },
    { id: 'CK04', phase: 'KHOI_TAO', name: 'Lập kế hoạch tổng thể và chốt baseline tiến độ', deliverable: 'Kế hoạch dự án (baseline)' },
    { id: 'CK05', phase: 'PHAN_TICH', name: 'Hoàn thiện tài liệu yêu cầu nghiệp vụ (BRD)', deliverable: 'BRD đã ký' },
    { id: 'CK06', phase: 'PHAN_TICH', name: 'Chốt phạm vi triển khai và danh mục loại trừ', deliverable: 'Biên bản chốt phạm vi' },
    { id: 'CK07', phase: 'PHAN_TICH', name: 'Thiết kế giải pháp tổng thể (HLD)', deliverable: 'Tài liệu HLD' },
    { id: 'CK08', phase: 'PHAN_TICH', name: 'Đánh giá rủi ro và an toàn thông tin', deliverable: 'Biên bản đánh giá ATTT' },
    { id: 'CK09', phase: 'PHAN_TICH', name: 'Phê duyệt kiến trúc (ARB)', deliverable: 'Nghị quyết ARB' },
    { id: 'CK10', phase: 'PHAT_TRIEN', name: 'Thiết kế chi tiết (LLD) và chốt API contract', deliverable: 'LLD + OpenAPI spec' },
    { id: 'CK11', phase: 'PHAT_TRIEN', name: 'Thiết lập môi trường DEV/SIT', deliverable: 'Biên bản bàn giao môi trường' },
    { id: 'CK12', phase: 'PHAT_TRIEN', name: 'Code review và quét bảo mật mã nguồn', deliverable: 'Báo cáo SAST' },
    { id: 'CK13', phase: 'PHAT_TRIEN', name: 'Unit test đạt ngưỡng coverage cam kết', deliverable: 'Báo cáo coverage' },
    { id: 'CK14', phase: 'PHAT_TRIEN', name: 'Chuẩn bị dữ liệu và công cụ chuyển đổi', deliverable: 'Script migration' },
    { id: 'CK15', phase: 'KIEM_THU', name: 'Kế hoạch và bộ test case được phê duyệt', deliverable: 'Test plan' },
    { id: 'CK16', phase: 'KIEM_THU', name: 'Hoàn thành SIT toàn trình', deliverable: 'Báo cáo SIT' },
    { id: 'CK17', phase: 'KIEM_THU', name: 'Hoàn thành UAT và ký nghiệm thu nghiệp vụ', deliverable: 'Biên bản UAT' },
    { id: 'CK18', phase: 'KIEM_THU', name: 'Kiểm thử hiệu năng đạt SLA', deliverable: 'Báo cáo performance test' },
    { id: 'CK19', phase: 'KIEM_THU', name: 'Kiểm thử bảo mật / pentest', deliverable: 'Báo cáo pentest' },
    { id: 'CK20', phase: 'GOLIVE', name: 'Kế hoạch triển khai và phương án rollback', deliverable: 'Cutover plan' },
    { id: 'CK21', phase: 'GOLIVE', name: 'Phê duyệt go-live của Hội đồng', deliverable: 'Biên bản phê duyệt go-live' },
    { id: 'CK22', phase: 'GOLIVE', name: 'Đào tạo người dùng và phát hành tài liệu hướng dẫn', deliverable: 'Tài liệu HDSD' },
    { id: 'CK23', phase: 'GOLIVE', name: 'Diễn tập chuyển đổi (dry-run)', deliverable: 'Biên bản dry-run' },
    { id: 'CK24', phase: 'HAU_GOLIVE', name: 'Hypercare và xử lý sự cố sau go-live', deliverable: 'Báo cáo hypercare' },
    { id: 'CK25', phase: 'HAU_GOLIVE', name: 'Đánh giá hiệu quả triển khai so với OKR', deliverable: 'Báo cáo đánh giá hiệu quả' },
    { id: 'CK26', phase: 'HAU_GOLIVE', name: 'Bàn giao vận hành và đóng dự án', deliverable: 'Biên bản bàn giao vận hành' }
  ];

  /** gọn hoá: 'CK01|done|Đinh Minh Hiếu|2024-03-29|QĐ 1123/2024' */
  function ckState(lines) {
    const m = {};
    lines.forEach((l) => {
      const p = l.split('|');
      m[p[0]] = { status: p[1], owner: p[2] || '', due: p[3] || '', evidence: p[4] || '', note: p[5] || '' };
    });
    return m;
  }

  /* ====================================================== PROJECT: PMP === */
  const PMP = {
    id: 'PMP', code: 'PMP', name: 'Payment Platform',
    hasDetail: true,
    status: 'Đang triển khai', health: 'Cần chú ý',
    type: 'Dự án', form: 'Yêu cầu phát triển', priority: 'Ngân hàng',
    domain: 'Chuyển tiền', leader: 'Đỗ Diệu Hằng',
    startDate: '2024-03-10', endDate: '2026-12-31',
    currentPhase: 'Kiểm thử',
    progressActual: 78, progressExpected: 86,
    shareDisabled: false,
    context: 'Các kênh chuyển tiền đang được quy hoạch không tập trung, gặp khó khăn trong việc mở rộng/tinh chỉnh.',
    objective: 'Xây dựng nền tảng thanh toán tập trung, dùng chung cho toàn bộ kênh số của ngân hàng.',
    scopeText: 'Tích hợp với các kênh bao gồm SC, Biz, App, BaaS vào tháng 6/2025.',
    people: { pd: 'Nguyễn Tuấn Định', td: 'Nguyễn Thanh Cao', pm: 'Đinh Minh Hiếu' },
    members: [
      { role: 'Dev', dept: 'Phòng tích hợp', fte: 12 },
      { role: 'Dev', dept: 'Phòng Giải pháp quản trị nội bộ', fte: 7 },
      { role: 'BA', dept: 'BA Dịch vụ số', fte: 5 },
      { role: 'Test', dept: 'Kiểm thử Ứng dụng số', fte: 14 }
    ],
    okr: [
      { obj: 'Tăng trưởng khách hàng', kr: '10% khách hàng active', result: '7,2% (chốt T9/2026)', pct: 72 },
      { obj: 'Giảm thời gian downtime', kr: 'Zero downtime', result: '2 sự cố / tổng 38 phút', pct: 55 }
    ],
    external: { jiraKey: 'PMP', jiraUrl: '#', opmsDemand: 'OPMS-DM-2024-0318', ttmEnabled: true },
    schedule: {
      groups: [
        {
          id: 'G1', name: 'Phân tích & thiết kế', tasks: [
            { id: 'T1', name: 'Khảo sát hiện trạng kênh chuyển tiền', owner: 'Trần Thu Hà', baseStart: '2024-03-10', baseEnd: '2024-04-30', start: '2024-03-10', end: '2024-04-30', pct: 100, deps: [] },
            { id: 'T2', name: 'Thiết kế kiến trúc nền tảng', owner: 'Nguyễn Thanh Cao', baseStart: '2024-05-02', baseEnd: '2024-07-15', start: '2024-05-02', end: '2024-07-31', pct: 100, deps: ['T1'] },
            { id: 'T3', name: 'Phê duyệt HLD/LLD', owner: 'Nguyễn Tuấn Định', baseStart: '2024-07-16', baseEnd: '2024-08-30', start: '2024-08-01', end: '2024-09-20', pct: 100, deps: ['T2'] }
          ]
        },
        {
          id: 'G2', name: 'Phát triển core & tích hợp kênh', tasks: [
            { id: 'T4', name: 'Payment core engine', owner: 'Phòng tích hợp', baseStart: '2024-09-02', baseEnd: '2025-06-30', start: '2024-09-23', end: '2025-08-15', pct: 100, deps: ['T3'] },
            { id: 'T5', name: 'Tích hợp kênh SC & Biz', owner: 'Phòng tích hợp', baseStart: '2025-03-03', baseEnd: '2025-09-30', start: '2025-04-01', end: '2025-11-28', pct: 100, deps: ['T4'] },
            { id: 'T6', name: 'Tích hợp kênh App & BaaS', owner: 'Phòng tích hợp', baseStart: '2025-07-01', baseEnd: '2025-12-31', start: '2025-09-01', end: '2026-03-31', pct: 100, deps: ['T5'] }
          ]
        },
        {
          id: 'G3', name: 'Kiểm thử & chuyển đổi', tasks: [
            { id: 'T7', name: 'SIT toàn trình', owner: 'Lê Quốc Dũng', baseStart: '2026-01-05', baseEnd: '2026-05-29', start: '2026-04-01', end: '2026-08-14', pct: 100, deps: ['T6'] },
            { id: 'T8', name: 'UAT nghiệp vụ (2 đợt)', owner: 'Trần Thu Hà', baseStart: '2026-06-01', baseEnd: '2026-08-31', start: '2026-08-17', end: '2026-11-13', pct: 68, deps: ['T7'], critical: true },
            { id: 'T9', name: 'Kiểm thử hiệu năng & bảo mật', owner: 'Vũ Thị Mai', baseStart: '2026-07-01', baseEnd: '2026-08-31', start: '2026-09-01', end: '2026-10-31', pct: 55, deps: ['T7'] },
            { id: 'T10', name: 'Chuyển đổi dữ liệu & diễn tập', owner: 'Phạm Anh Tuấn', baseStart: '2026-09-01', baseEnd: '2026-10-31', start: '2026-11-02', end: '2026-12-05', pct: 10, deps: ['T8', 'T9'], critical: true }
          ]
        },
        {
          id: 'G4', name: 'Go-live & hậu go-live', tasks: [
            { id: 'T11', name: 'Go-live theo đợt', owner: 'Đinh Minh Hiếu', baseStart: '2026-11-02', baseEnd: '2026-11-30', start: '2026-12-07', end: '2026-12-24', pct: 0, deps: ['T10'], critical: true },
            { id: 'T12', name: 'Hypercare', owner: 'Đinh Minh Hiếu', baseStart: '2026-12-01', baseEnd: '2026-12-31', start: '2026-12-25', end: '2027-01-30', pct: 0, deps: ['T11'] }
          ]
        }
      ],
      milestones: [
        { id: 'M1', name: 'Phê duyệt thiết kế', baseDate: '2024-08-30', date: '2024-09-20', status: 'done' },
        { id: 'M2', name: 'Hoàn thành tích hợp 4 kênh', baseDate: '2025-12-31', date: '2026-03-31', status: 'done' },
        { id: 'M3', name: 'Kết thúc UAT', baseDate: '2026-08-31', date: '2026-11-13', status: 'late' },
        { id: 'M4', name: 'R4 Go-live', baseDate: '2026-11-30', date: '2026-12-24', status: 'late' },
        { id: 'M5', name: 'Kết thúc hypercare / đóng dự án', baseDate: '2026-12-31', date: '2027-01-30', status: 'late' }
      ]
    },
    checklist: ckState([
      'CK01|done|Đỗ Diệu Hằng|2024-03-20|TTr 118/2024/TTr-CNTT',
      'CK02|done|Đinh Minh Hiếu|2024-03-29|QĐ 1123/2024/QĐ-TGĐ',
      'CK03|done|Đinh Minh Hiếu|2024-04-05|OKR-PMP-2024.pdf',
      'CK04|done|Đinh Minh Hiếu|2024-04-19|Baseline v2.1 (20/02/2026)',
      'CK05|done|Trần Thu Hà|2024-06-28|BRD-PMP-v3.2.docx',
      'CK06|done|Trần Thu Hà|2024-07-12|BB chốt phạm vi 12/07/2024',
      'CK07|done|Nguyễn Thanh Cao|2024-08-16|HLD-PMP-v2.0.pdf',
      'CK08|done|Vũ Thị Mai|2024-08-23|BB đánh giá ATTT 23/08/2024',
      'CK09|done|Nguyễn Tuấn Định|2024-09-20|NQ ARB 2024/09-17',
      'CK10|done|Nguyễn Thanh Cao|2024-11-29|LLD + openapi-pmp-v1.yaml',
      'CK11|done|Phạm Anh Tuấn|2024-09-30|BB bàn giao môi trường SIT',
      'CK12|done|Nguyễn Thanh Cao|2026-06-30|SAST report 28/06/2026',
      'CK13|done|Lê Quốc Dũng|2026-07-31|Coverage 68% (cam kết 65%)',
      'CK14|na|Phạm Anh Tuấn||—|Dùng công cụ migration dùng chung của Khối CNTT',
      'CK15|done|Lê Quốc Dũng|2026-03-31|Test plan PMP v2',
      'CK16|done|Lê Quốc Dũng|2026-08-14|Báo cáo SIT 14/08/2026',
      'CK17|doing|Trần Thu Hà|2026-11-13|UAT đợt 1 đã ký, đợt 2 đang chạy',
      'CK18|doing|Vũ Thị Mai|2026-10-31|Vòng 2 đang đo lại sau tuning',
      'CK19|todo|Vũ Thị Mai|2026-09-30||Chưa đặt được lịch với đơn vị pentest',
      'CK20|doing|Đinh Minh Hiếu|2026-10-20|Cutover plan draft v0.8',
      'CK21|todo|Đỗ Diệu Hằng|2026-11-25|',
      'CK22|todo|Trần Thu Hà|2026-10-31|',
      'CK23|todo|Phạm Anh Tuấn|2026-09-25||Phụ thuộc hoàn thành công cụ chuyển đổi',
      'CK24|todo|Đinh Minh Hiếu|2026-12-31|',
      'CK25|todo|Đinh Minh Hiếu|2027-01-31|',
      'CK26|todo|Đinh Minh Hiếu|2027-02-15|'
    ]),
    scope: {
      baselineVersion: 'v2.1', baselineDate: '2026-02-20', baselineDays: 1027,
      items: [
        { id: 'SC01', name: 'Nền tảng thanh toán tập trung (payment core)', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC02', name: 'Tích hợp kênh Smart Banking (SC)', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC03', name: 'Tích hợp kênh Biz Banking', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC04', name: 'Tích hợp kênh App & BaaS', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC05', name: 'Xác thực sinh trắc cho giao dịch giá trị lớn', type: 'in', note: 'Bổ sung theo CR-02' },
        { id: 'SC06', name: 'Chuyển đổi dữ liệu giao dịch lịch sử 5 năm', type: 'in', note: 'Bổ sung theo CR-01' },
        { id: 'SC07', name: 'Cổng đối soát giao dịch liên kênh', type: 'in', note: 'Bổ sung theo CR-03' },
        { id: 'SC08', name: 'Thanh toán quốc tế (SWIFT)', type: 'out', note: 'Thuộc dự án Trade Finance 2027' },
        { id: 'SC09', name: 'Ví điện tử của đối tác ngoài', type: 'out', note: 'Chưa có cơ sở pháp lý nội bộ' },
        { id: 'SC10', name: 'Thay thế hệ thống thẻ', type: 'out', note: 'Ngoài phạm vi, giữ nguyên hiện trạng' }
      ],
      crs: [
        { id: 'CR-01', title: 'Bổ sung chuyển đổi dữ liệu giao dịch lịch sử 5 năm', reason: 'Khối Vận hành yêu cầu phục vụ tra soát khiếu nại', days: 30, cost: 1800, fte: 3, status: 'Đã duyệt', date: '2026-03-18', requester: 'Khối Vận hành' },
        { id: 'CR-02', title: 'Bổ sung xác thực sinh trắc cho giao dịch trên 10 triệu', reason: 'Tuân thủ Quyết định 2345/QĐ-NHNN', days: 15, cost: 950, fte: 2, status: 'Đã duyệt', date: '2026-05-06', requester: 'Khối QLRR' },
        { id: 'CR-03', title: 'Bổ sung cổng đối soát giao dịch liên kênh', reason: 'Phát sinh lệch đối soát 0,3% trong SIT', days: 12, cost: 620, fte: 2, status: 'Đã duyệt', date: '2026-07-22', requester: 'Ban Dự án' },
        { id: 'CR-04', title: 'Mở rộng tích hợp kênh đối tác BaaS thứ ba', reason: 'Đề xuất cơ hội kinh doanh mới từ Khối KHDN', days: 25, cost: 1400, fte: 3, status: 'Chờ duyệt', date: '2026-09-30', requester: 'Khối KHDN' },
        { id: 'CR-05', title: 'Nâng SLA phản hồi API từ 800ms xuống 400ms', reason: 'Phản hồi trải nghiệm từ UAT đợt 1', days: 8, cost: 300, fte: 1, status: 'Từ chối', date: '2026-08-12', requester: 'Khối Vận hành' }
      ]
    },
    risks: [
      { id: 'R-01', title: 'Chuỗi UAT → chuyển đổi dữ liệu → go-live bị dồn, nguy cơ trượt mốc 30/11/2026', category: 'Tiến độ', p: 4, i: 5, owner: 'Đinh Minh Hiếu', strategy: 'Giảm thiểu', response: 'Chạy song song UAT đợt 2 và diễn tập chuyển đổi; bổ sung 2 slot môi trường SIT', due: '2026-10-25', status: 'Đang xử lý' },
      { id: 'R-02', title: 'Chưa hoàn thành pentest trước thời điểm go-live', category: 'Bảo mật & tuân thủ', p: 3, i: 5, owner: 'Vũ Thị Mai', strategy: 'Giảm thiểu', response: 'Chốt lịch pentest tuần 43; danh mục findings bắt buộc đóng trước R4', due: '2026-10-31', status: 'Mới ghi nhận' },
      { id: 'R-03', title: 'Hiệu năng API chưa đạt SLA 800ms ở tải cao điểm', category: 'Kỹ thuật', p: 4, i: 4, owner: 'Nguyễn Thanh Cao', strategy: 'Giảm thiểu', response: 'Tuning connection pool và cache; đo lại vòng 2 trước 31/10', due: '2026-10-28', status: 'Đang xử lý' },
      { id: 'R-04', title: 'Nhân sự Test chia sẻ với dự án eKYC, thiếu khoảng 4 FTE giai đoạn UAT', category: 'Nhân sự', p: 4, i: 3, owner: 'Lê Quốc Dũng', strategy: 'Giảm thiểu', response: 'Đề xuất tăng cường 4 FTE thuê ngoài trong 6 tuần', due: '2026-10-20', status: 'Đang xử lý' },
      { id: 'R-05', title: 'Dữ liệu giao dịch lịch sử không đồng nhất giữa 3 nguồn', category: 'Dữ liệu', p: 3, i: 4, owner: 'Phạm Anh Tuấn', strategy: 'Giảm thiểu', response: 'Bổ sung bước chuẩn hoá và đối soát mẫu 5% trước khi chuyển đổi thật', due: '2026-11-15', status: 'Đang xử lý' },
      { id: 'R-06', title: 'Phụ thuộc lịch phát hành của đối tác BaaS', category: 'Phụ thuộc ngoài', p: 2, i: 3, owner: 'Trần Thu Hà', strategy: 'Chấp nhận', response: 'Theo dõi lịch phát hành hằng tuần, có phương án hoãn kênh BaaS sang đợt 2', due: '2026-11-30', status: 'Theo dõi' },
      { id: 'R-07', title: 'Chi phí vượt dự toán do ba yêu cầu thay đổi đã duyệt', category: 'Chi phí', p: 3, i: 3, owner: 'Đỗ Diệu Hằng', strategy: 'Giảm thiểu', response: 'Trình điều chỉnh dự toán bổ sung 3,4 tỷ; rà soát lại hạng mục chưa cam kết', due: '2026-11-10', status: 'Đang xử lý' },
      { id: 'R-08', title: 'Người dùng chi nhánh chưa được đào tạo đủ trước go-live', category: 'Vận hành', p: 2, i: 2, owner: 'Trần Thu Hà', strategy: 'Giảm thiểu', response: 'Tổ chức 6 lớp đào tạo vùng trong tháng 11', due: '2026-11-20', status: 'Mới ghi nhận' },
      { id: 'R-09', title: 'Thiếu môi trường SIT riêng cho dự án', category: 'Kỹ thuật', p: 3, i: 3, owner: 'Phạm Anh Tuấn', strategy: 'Giảm thiểu', response: 'Đã cấp thêm 2 namespace OCP riêng cho PMP', due: '2026-06-30', status: 'Đã đóng' }
    ],
    issues: [
      { id: 'I-01', title: 'Lệch đối soát 0,3% giao dịch liên kênh trong SIT', impact: 'Chặn UAT luồng đối soát', owner: 'Trần Thu Hà', since: '2026-09-18', status: 'Đang xử lý', severity: 'Cao' },
      { id: 'I-02', title: 'Môi trường UAT bị trùng lịch với dự án eKYC', impact: 'Mất 3 ngày UAT đợt 2', owner: 'Phạm Anh Tuấn', since: '2026-10-02', status: 'Đang xử lý', severity: 'Trung bình' },
      { id: 'I-03', title: 'Chưa có phê duyệt mua license công cụ APM', impact: 'Chậm đo hiệu năng vòng 2', owner: 'Đinh Minh Hiếu', since: '2026-09-25', status: 'Chờ xử lý', severity: 'Trung bình' }
    ],
    quality: {
      defectDensity: 1.8, defectDensityTarget: 2.0,
      defectTotal: 412, defectOpen: 63, defectCriticalOpen: 4,
      leakageUat: 12.4, leakageUatTarget: 10,
      leakageProd: 1.2, leakageProdTarget: 1.0,
      passRate: 91.3, passRateTarget: 95,
      reworkRate: 8.6, reworkRateTarget: 5,
      coverage: 68, coverageTarget: 65,
      trendDefect: [48, 61, 73, 66, 58, 51, 44, 39],
      trendPass: [78, 81, 84, 86, 88, 90, 91, 91.3],
      reviews: [
        { phase: 'Khởi tạo', date: '2024-04-19', result: 'Đạt', note: 'Baseline và OKR đầy đủ' },
        { phase: 'Phân tích & thiết kế', date: '2024-09-20', result: 'Đạt', note: 'ARB duyệt kèm 3 khuyến nghị' },
        { phase: 'Phát triển', date: '2026-07-31', result: 'Đạt có điều kiện', note: 'Coverage 68%, còn 4 findings SAST mức trung bình' },
        { phase: 'Kiểm thử', date: '', result: 'Chưa đánh giá', note: 'Chờ kết thúc UAT đợt 2 và pentest' }
      ],
      cost: { planned: 42000, approvedExtra: 3370, actual: 38600, committed: 45200 },
      ttm: { cntt: 'Đạt', e2e: 'Chưa đạt', avgDays: 46, targetDays: 40, epicCount: 128, epicLate: 23 },
      postGolive: 'Chưa đánh giá — dự kiến đo hiệu quả sau 3 tháng vận hành (Q1/2027).'
    }
  };

  /* ===================================================== PROJECT: EKYC === */
  const EKYC = {
    id: 'EKYC', code: 'EKYC', name: 'eKYC Onboarding',
    hasDetail: true,
    status: 'Đang triển khai', health: 'Tốt',
    type: 'Dự án', form: 'Yêu cầu phát triển', priority: 'Khối',
    domain: 'Khách hàng cá nhân', leader: 'Lê Hồng Vân',
    startDate: '2026-01-05', endDate: '2026-12-15',
    currentPhase: 'Kiểm thử',
    progressActual: 64, progressExpected: 62,
    shareDisabled: false,
    context: 'Quy trình mở tài khoản tại quầy còn nhiều bước thủ công, thời gian trung bình 23 phút/khách hàng.',
    objective: 'Số hoá toàn trình mở tài khoản cá nhân qua eKYC với NFC và đối chiếu sinh trắc.',
    scopeText: 'Triển khai trên App MB và kênh web, hoàn thành trước 20/11/2026.',
    people: { pd: 'Lê Hồng Vân', td: 'Hoàng Minh Khôi', pm: 'Nguyễn Thị Lan' },
    members: [
      { role: 'Dev', dept: 'Phòng Ứng dụng số', fte: 9 },
      { role: 'BA', dept: 'BA Khách hàng cá nhân', fte: 4 },
      { role: 'Test', dept: 'Kiểm thử Ứng dụng số', fte: 6 },
      { role: 'DevOps', dept: 'Trung tâm hạ tầng', fte: 2 }
    ],
    okr: [
      { obj: 'Giảm thời gian mở tài khoản', kr: 'Dưới 5 phút/khách hàng', result: '4,6 phút (SIT)', pct: 92 },
      { obj: 'Tăng tỷ lệ onboarding số', kr: '60% tài khoản mở qua kênh số', result: 'Chưa đo (sau go-live)', pct: 0 }
    ],
    external: { jiraKey: 'EKYC', jiraUrl: '#', opmsDemand: 'OPMS-DM-2025-1142', ttmEnabled: true },
    schedule: {
      groups: [
        {
          id: 'G1', name: 'Khởi tạo & phân tích', tasks: [
            { id: 'T1', name: 'Hoàn thiện yêu cầu và luồng nghiệp vụ', owner: 'Nguyễn Thị Lan', baseStart: '2026-01-05', baseEnd: '2026-02-27', start: '2026-01-05', end: '2026-02-27', pct: 100, deps: [] }
          ]
        },
        {
          id: 'G2', name: 'Phát triển', tasks: [
            { id: 'T2', name: 'Tích hợp SDK đọc NFC căn cước', owner: 'Hoàng Minh Khôi', baseStart: '2026-03-02', baseEnd: '2026-06-30', start: '2026-03-02', end: '2026-07-03', pct: 100, deps: ['T1'] },
            { id: 'T3', name: 'Luồng onboarding trên App', owner: 'Phòng Ứng dụng số', baseStart: '2026-04-01', baseEnd: '2026-07-31', start: '2026-04-01', end: '2026-07-31', pct: 100, deps: ['T1'] },
            { id: 'T4', name: 'Đối soát và chống gian lận', owner: 'Hoàng Minh Khôi', baseStart: '2026-06-01', baseEnd: '2026-08-31', start: '2026-06-08', end: '2026-09-04', pct: 100, deps: ['T2'] }
          ]
        },
        {
          id: 'G3', name: 'Kiểm thử', tasks: [
            { id: 'T5', name: 'SIT toàn trình', owner: 'Đỗ Quang Huy', baseStart: '2026-08-03', baseEnd: '2026-09-30', start: '2026-08-03', end: '2026-09-30', pct: 100, deps: ['T3', 'T4'] },
            { id: 'T6', name: 'UAT nghiệp vụ', owner: 'Nguyễn Thị Lan', baseStart: '2026-09-07', baseEnd: '2026-10-30', start: '2026-09-07', end: '2026-10-30', pct: 72, deps: ['T5'], critical: true }
          ]
        },
        {
          id: 'G4', name: 'Go-live & hậu go-live', tasks: [
            { id: 'T7', name: 'Go-live toàn hệ thống', owner: 'Nguyễn Thị Lan', baseStart: '2026-11-02', baseEnd: '2026-11-20', start: '2026-11-02', end: '2026-11-20', pct: 0, deps: ['T6'], critical: true },
            { id: 'T8', name: 'Hypercare', owner: 'Nguyễn Thị Lan', baseStart: '2026-11-23', baseEnd: '2026-12-15', start: '2026-11-23', end: '2026-12-15', pct: 0, deps: ['T7'] }
          ]
        }
      ],
      milestones: [
        { id: 'M1', name: 'Kết thúc phát triển', baseDate: '2026-08-31', date: '2026-09-04', status: 'done' },
        { id: 'M2', name: 'Kết thúc UAT', baseDate: '2026-10-30', date: '2026-10-30', status: 'plan' },
        { id: 'M3', name: 'R4 Go-live', baseDate: '2026-11-20', date: '2026-11-20', status: 'plan' },
        { id: 'M4', name: 'Đóng dự án', baseDate: '2026-12-15', date: '2026-12-15', status: 'plan' }
      ]
    },
    checklist: ckState([
      'CK01|done|Lê Hồng Vân|2025-12-10|TTr 402/2025/TTr-CNTT',
      'CK02|done|Nguyễn Thị Lan|2025-12-22|QĐ 2890/2025/QĐ-TGĐ',
      'CK03|done|Nguyễn Thị Lan|2026-01-09|OKR-EKYC-2026.pdf',
      'CK04|done|Nguyễn Thị Lan|2026-01-16|Baseline v1.0 (16/01/2026)',
      'CK05|done|Nguyễn Thị Lan|2026-02-20|BRD-EKYC-v2.0.docx',
      'CK06|done|Nguyễn Thị Lan|2026-02-27|BB chốt phạm vi 27/02/2026',
      'CK07|done|Hoàng Minh Khôi|2026-03-13|HLD-EKYC-v1.1.pdf',
      'CK08|done|Vũ Thị Mai|2026-03-20|BB đánh giá ATTT 20/03/2026',
      'CK09|done|Lê Hồng Vân|2026-03-27|NQ ARB 2026/03-08',
      'CK10|done|Hoàng Minh Khôi|2026-04-10|LLD + openapi-ekyc-v1.yaml',
      'CK11|done|Trần Văn Nam|2026-03-06|BB bàn giao môi trường',
      'CK12|done|Hoàng Minh Khôi|2026-07-31|SAST report 29/07/2026',
      'CK13|done|Đỗ Quang Huy|2026-07-31|Coverage 74%',
      'CK14|na|Trần Văn Nam||—|Không có dữ liệu lịch sử cần chuyển đổi',
      'CK15|done|Đỗ Quang Huy|2026-07-24|Test plan EKYC v1',
      'CK16|done|Đỗ Quang Huy|2026-09-30|Báo cáo SIT 30/09/2026',
      'CK17|doing|Nguyễn Thị Lan|2026-10-30|UAT đạt 72% test case',
      'CK18|done|Trần Văn Nam|2026-09-25|P95 1,4s đạt SLA 2s',
      'CK19|done|Vũ Thị Mai|2026-10-02|Pentest: 0 lỗi nghiêm trọng',
      'CK20|doing|Nguyễn Thị Lan|2026-10-25|Cutover plan v0.9',
      'CK21|todo|Lê Hồng Vân|2026-10-28|',
      'CK22|doing|Nguyễn Thị Lan|2026-10-31|Đã đào tạo 3/8 vùng',
      'CK23|todo|Trần Văn Nam|2026-10-27|',
      'CK24|todo|Nguyễn Thị Lan|2026-12-10|',
      'CK25|todo|Nguyễn Thị Lan|2027-02-28|',
      'CK26|todo|Nguyễn Thị Lan|2026-12-15|'
    ]),
    scope: {
      baselineVersion: 'v1.0', baselineDate: '2026-01-16', baselineDays: 344,
      items: [
        { id: 'SC01', name: 'eKYC qua NFC căn cước gắn chip', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC02', name: 'Đối chiếu sinh trắc khuôn mặt (liveness)', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC03', name: 'Luồng onboarding trên App MB', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC04', name: 'Luồng onboarding trên kênh web', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC05', name: 'Cảnh báo gian lận theo danh sách đen', type: 'in', note: 'Bổ sung theo CR-01' },
        { id: 'SC06', name: 'Mở tài khoản doanh nghiệp', type: 'out', note: 'Thuộc lộ trình 2027' },
        { id: 'SC07', name: 'Phát hành thẻ tức thời', type: 'out', note: 'Ngoài phạm vi' }
      ],
      crs: [
        { id: 'CR-01', title: 'Bổ sung cảnh báo gian lận theo danh sách đen nội bộ', reason: 'Yêu cầu Khối QLRR sau đánh giá ATTT', days: 5, cost: 180, fte: 1, status: 'Đã duyệt', date: '2026-04-15', requester: 'Khối QLRR' },
        { id: 'CR-02', title: 'Bổ sung mở tài khoản cho khách hàng doanh nghiệp', reason: 'Đề xuất từ Khối KHDN', days: 70, cost: 4200, fte: 6, status: 'Từ chối', date: '2026-05-20', requester: 'Khối KHDN' }
      ]
    },
    risks: [
      { id: 'R-01', title: 'Tỷ lệ đọc NFC thất bại trên một số dòng máy Android cũ', category: 'Kỹ thuật', p: 3, i: 3, owner: 'Hoàng Minh Khôi', strategy: 'Giảm thiểu', response: 'Bổ sung luồng dự phòng chụp ảnh OCR; cảnh báo thiết bị không hỗ trợ', due: '2026-10-25', status: 'Đang xử lý' },
      { id: 'R-02', title: 'Phụ thuộc dịch vụ xác thực căn cước của C06', category: 'Phụ thuộc ngoài', p: 2, i: 4, owner: 'Nguyễn Thị Lan', strategy: 'Chấp nhận', response: 'Theo dõi SLA dịch vụ; có phương án hàng đợi khi dịch vụ gián đoạn', due: '2026-11-15', status: 'Theo dõi' },
      { id: 'R-03', title: 'Môi trường UAT dùng chung với dự án Payment Platform', category: 'Tiến độ', p: 3, i: 2, owner: 'Trần Văn Nam', strategy: 'Giảm thiểu', response: 'Chốt lịch dùng môi trường theo tuần với Ban Dự án', due: '2026-10-20', status: 'Đang xử lý' },
      { id: 'R-04', title: 'Người dùng chưa quen luồng onboarding mới', category: 'Vận hành', p: 2, i: 2, owner: 'Nguyễn Thị Lan', strategy: 'Giảm thiểu', response: 'Video hướng dẫn trong App và đào tạo CSKH', due: '2026-11-10', status: 'Mới ghi nhận' },
      { id: 'R-05', title: 'Thiếu nhân sự kiểm thử giai đoạn UAT', category: 'Nhân sự', p: 2, i: 3, owner: 'Đỗ Quang Huy', strategy: 'Giảm thiểu', response: 'Đã bổ sung 2 FTE từ nhóm kiểm thử dùng chung', due: '2026-09-30', status: 'Đã đóng' }
    ],
    issues: [
      { id: 'I-01', title: 'Lỗi liveness nhận sai với ảnh chụp ngược sáng', impact: '8 test case UAT chưa pass', owner: 'Hoàng Minh Khôi', since: '2026-10-05', status: 'Đang xử lý', severity: 'Trung bình' }
    ],
    quality: {
      defectDensity: 1.1, defectDensityTarget: 2.0,
      defectTotal: 186, defectOpen: 21, defectCriticalOpen: 0,
      leakageUat: 7.5, leakageUatTarget: 10,
      leakageProd: 0, leakageProdTarget: 1.0,
      passRate: 96.2, passRateTarget: 95,
      reworkRate: 4.1, reworkRateTarget: 5,
      coverage: 74, coverageTarget: 70,
      trendDefect: [34, 29, 31, 26, 22, 18, 14, 11],
      trendPass: [84, 87, 89, 91, 93, 95, 96, 96.2],
      reviews: [
        { phase: 'Khởi tạo', date: '2026-01-16', result: 'Đạt', note: '' },
        { phase: 'Phân tích & thiết kế', date: '2026-03-27', result: 'Đạt', note: '' },
        { phase: 'Phát triển', date: '2026-07-31', result: 'Đạt', note: 'Coverage 74%, không có findings nghiêm trọng' },
        { phase: 'Kiểm thử', date: '', result: 'Chưa đánh giá', note: 'Chờ kết thúc UAT 30/10' }
      ],
      cost: { planned: 12500, approvedExtra: 180, actual: 9800, committed: 11900 },
      ttm: { cntt: 'Đạt', e2e: 'Đạt', avgDays: 34, targetDays: 40, epicCount: 52, epicLate: 4 },
      postGolive: 'Chưa đánh giá — dự kiến đo sau 3 tháng vận hành (Q1/2027).'
    }
  };

  /* ====================================================== PROJECT: CBU === */
  const CBU = {
    id: 'CBU', code: 'CBU', name: 'Core Banking Upgrade',
    hasDetail: true,
    status: 'Đang triển khai', health: 'Rủi ro cao',
    type: 'Dự án', form: 'Yêu cầu nâng cấp hệ thống', priority: 'Ngân hàng',
    domain: 'Core & Kênh phân phối', leader: 'Trịnh Văn Sơn',
    startDate: '2025-06-02', endDate: '2027-06-30',
    currentPhase: 'Phát triển',
    progressActual: 41, progressExpected: 63,
    shareDisabled: true,
    context: 'Phiên bản core hiện tại hết hỗ trợ của nhà cung cấp từ Q4/2027, không đáp ứng throughput mục tiêu 2028.',
    objective: 'Nâng cấp core banking lên phiên bản mới, tăng throughput 3 lần và chuẩn hoá dữ liệu khách hàng.',
    scopeText: 'Nâng cấp module tiền gửi, tín dụng và chuẩn hoá CIF; chuyển đổi theo đợt trong Q2/2027.',
    people: { pd: 'Trịnh Văn Sơn', td: 'Bùi Đức Long', pm: 'Phan Thanh Tùng' },
    members: [
      { role: 'Dev', dept: 'Trung tâm Core Banking', fte: 18 },
      { role: 'Dev', dept: 'Đối tác triển khai', fte: 22 },
      { role: 'BA', dept: 'BA Core & Nghiệp vụ', fte: 8 },
      { role: 'Test', dept: 'Kiểm thử Core', fte: 11 },
      { role: 'DBA', dept: 'Trung tâm dữ liệu', fte: 4 }
    ],
    okr: [
      { obj: 'Tăng năng lực xử lý giao dịch', kr: 'Throughput 3x so với hiện tại', result: '1,4x (đo trên môi trường SIT)', pct: 47 },
      { obj: 'Chuẩn hoá dữ liệu khách hàng', kr: '95% CIF đạt chuẩn chất lượng', result: '61% (tháng 9/2026)', pct: 64 }
    ],
    external: { jiraKey: 'CBU', jiraUrl: '#', opmsDemand: 'OPMS-DM-2025-0217', ttmEnabled: false },
    schedule: {
      groups: [
        {
          id: 'G1', name: 'Khởi tạo & đánh giá', tasks: [
            { id: 'T1', name: 'Đánh giá hiện trạng core', owner: 'Bùi Đức Long', baseStart: '2025-06-02', baseEnd: '2025-09-30', start: '2025-06-02', end: '2025-10-31', pct: 100, deps: [] },
            { id: 'T2', name: 'Lựa chọn phương án nâng cấp', owner: 'Trịnh Văn Sơn', baseStart: '2025-10-01', baseEnd: '2025-12-31', start: '2025-11-03', end: '2026-02-27', pct: 100, deps: ['T1'] }
          ]
        },
        {
          id: 'G2', name: 'Thiết kế', tasks: [
            { id: 'T3', name: 'Thiết kế kiến trúc mục tiêu', owner: 'Bùi Đức Long', baseStart: '2026-01-05', baseEnd: '2026-04-30', start: '2026-03-02', end: '2026-07-31', pct: 100, deps: ['T2'], critical: true },
            { id: 'T4', name: 'Thiết kế chuyển đổi dữ liệu', owner: 'Ngô Hải Yến', baseStart: '2026-03-02', baseEnd: '2026-06-30', start: '2026-05-04', end: '2026-09-30', pct: 85, deps: ['T3'] }
          ]
        },
        {
          id: 'G3', name: 'Phát triển & chuyển đổi', tasks: [
            { id: 'T5', name: 'Nâng cấp module tiền gửi', owner: 'Trung tâm Core Banking', baseStart: '2026-07-01', baseEnd: '2026-12-31', start: '2026-08-03', end: '2027-03-31', pct: 32, deps: ['T3'], critical: true },
            { id: 'T6', name: 'Nâng cấp module tín dụng', owner: 'Đối tác triển khai', baseStart: '2026-07-01', baseEnd: '2027-01-29', start: '2026-09-01', end: '2027-04-30', pct: 18, deps: ['T3'], critical: true },
            { id: 'T7', name: 'Xây dựng công cụ migration CIF', owner: 'Ngô Hải Yến', baseStart: '2026-08-03', baseEnd: '2026-11-30', start: '2026-10-01', end: '2027-01-29', pct: 8, deps: ['T4'] }
          ]
        },
        {
          id: 'G4', name: 'Kiểm thử & go-live', tasks: [
            { id: 'T8', name: 'SIT và UAT toàn trình', owner: 'Kiểm thử Core', baseStart: '2027-01-04', baseEnd: '2027-04-30', start: '2027-05-03', end: '2027-08-31', pct: 0, deps: ['T5', 'T6', 'T7'], critical: true },
            { id: 'T9', name: 'Diễn tập chuyển đổi 3 vòng', owner: 'Ngô Hải Yến', baseStart: '2027-03-01', baseEnd: '2027-05-31', start: '2027-07-01', end: '2027-09-30', pct: 0, deps: ['T7'] },
            { id: 'T10', name: 'Go-live theo đợt & hypercare', owner: 'Phan Thanh Tùng', baseStart: '2027-06-01', baseEnd: '2027-06-30', start: '2027-10-01', end: '2027-11-15', pct: 0, deps: ['T8', 'T9'], critical: true }
          ]
        }
      ],
      milestones: [
        { id: 'M1', name: 'Chốt phương án nâng cấp', baseDate: '2025-12-31', date: '2026-02-27', status: 'done' },
        { id: 'M2', name: 'Phê duyệt thiết kế mục tiêu', baseDate: '2026-06-30', date: '2026-09-30', status: 'late' },
        { id: 'M3', name: 'Hoàn thành phát triển', baseDate: '2027-01-29', date: '2027-04-30', status: 'late' },
        { id: 'M4', name: 'R4 Go-live', baseDate: '2027-06-30', date: '2027-11-15', status: 'late' }
      ]
    },
    checklist: ckState([
      'CK01|done|Trịnh Văn Sơn|2025-05-20|TTr 95/2025/TTr-CNTT',
      'CK02|done|Phan Thanh Tùng|2025-06-02|QĐ 1402/2025/QĐ-TGĐ',
      'CK03|done|Phan Thanh Tùng|2025-06-20|OKR-CBU-2025.pdf',
      'CK04|done|Phan Thanh Tùng|2025-07-04|Baseline v1.2 (04/07/2025)',
      'CK05|done|BA Core & Nghiệp vụ|2026-03-31|BRD-CBU-v4.0.docx',
      'CK06|done|Phan Thanh Tùng|2026-04-17|BB chốt phạm vi 17/04/2026',
      'CK07|done|Bùi Đức Long|2026-07-31|HLD-CBU-v2.3.pdf',
      'CK08|doing|Vũ Thị Mai|2026-08-31|Còn 6 khuyến nghị ATTT chưa đóng',
      'CK09|doing|Trịnh Văn Sơn|2026-09-30|ARB yêu cầu bổ sung phương án rollback',
      'CK10|done|Bùi Đức Long|2026-09-15|LLD module tiền gửi + tín dụng',
      'CK11|done|Trần Văn Nam|2026-06-30|BB bàn giao môi trường SIT core',
      'CK12|doing|Bùi Đức Long|2026-10-31|SAST vòng 1: 12 findings mức cao',
      'CK13|todo|Kiểm thử Core|2026-09-30||Coverage hiện tại 38%, cam kết 60%',
      'CK14|doing|Ngô Hải Yến|2026-11-30|Công cụ migration mới đạt 8%',
      'CK15|todo|Kiểm thử Core|2026-12-15|',
      'CK16|todo|Kiểm thử Core|2027-06-30|',
      'CK17|todo|BA Core & Nghiệp vụ|2027-08-31|',
      'CK18|todo|Trần Văn Nam|2027-07-31|',
      'CK19|todo|Vũ Thị Mai|2027-08-15|',
      'CK20|todo|Phan Thanh Tùng|2027-09-15|',
      'CK21|todo|Trịnh Văn Sơn|2027-09-30|',
      'CK22|todo|BA Core & Nghiệp vụ|2027-09-30|',
      'CK23|todo|Ngô Hải Yến|2027-09-30|',
      'CK24|todo|Phan Thanh Tùng|2027-11-15|',
      'CK25|todo|Phan Thanh Tùng|2028-02-29|',
      'CK26|todo|Phan Thanh Tùng|2027-12-15|'
    ]),
    scope: {
      baselineVersion: 'v1.2', baselineDate: '2025-07-04', baselineDays: 759,
      items: [
        { id: 'SC01', name: 'Nâng cấp phiên bản core banking', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC02', name: 'Nâng cấp module tiền gửi', type: 'in', note: 'Baseline v1.0' },
        { id: 'SC03', name: 'Chuẩn hoá dữ liệu khách hàng (CIF)', type: 'in', note: 'Bổ sung theo CR-02' },
        { id: 'SC04', name: 'Nâng cấp module tín dụng bán lẻ', type: 'in', note: 'Bổ sung theo CR-01' },
        { id: 'SC05', name: 'Tích hợp hệ thống báo cáo NHNN', type: 'in', note: 'Bổ sung theo CR-03' },
        { id: 'SC06', name: 'Nâng cấp module treasury', type: 'out', note: 'Giai đoạn 2 (2028)' },
        { id: 'SC07', name: 'Thay thế hệ thống thẻ', type: 'out', note: 'Ngoài phạm vi' },
        { id: 'SC08', name: 'Di chuyển hạ tầng lên cloud công cộng', type: 'out', note: 'Chưa được phê duyệt chủ trương' }
      ],
      crs: [
        { id: 'CR-01', title: 'Mở rộng nâng cấp sang module tín dụng bán lẻ', reason: 'Module tín dụng phụ thuộc phiên bản core mới, không thể tách giai đoạn', days: 60, cost: 5200, fte: 8, status: 'Đã duyệt', date: '2026-02-10', requester: 'Khối Tín dụng' },
        { id: 'CR-02', title: 'Bổ sung chuẩn hoá dữ liệu khách hàng (CIF cleanup)', reason: 'Chất lượng CIF hiện tại không đủ để chuyển đổi', days: 45, cost: 3100, fte: 6, status: 'Đã duyệt', date: '2026-04-28', requester: 'Ban Dự án' },
        { id: 'CR-03', title: 'Bổ sung tích hợp hệ thống báo cáo NHNN', reason: 'Thay đổi quy định báo cáo từ 01/2027', days: 20, cost: 1200, fte: 3, status: 'Đã duyệt', date: '2026-07-15', requester: 'Khối Tài chính' },
        { id: 'CR-04', title: 'Đổi phương án chuyển đổi từ big-bang sang theo đợt', reason: 'Giảm rủi ro gián đoạn vận hành khi go-live', days: 35, cost: 2400, fte: 4, status: 'Chờ duyệt', date: '2026-09-28', requester: 'Ban Dự án' }
      ]
    },
    risks: [
      { id: 'R-01', title: 'Chuỗi phát triển hai module chậm, đẩy go-live trượt khỏi mốc hết hỗ trợ của nhà cung cấp', category: 'Tiến độ', p: 5, i: 5, owner: 'Phan Thanh Tùng', strategy: 'Giảm thiểu', response: 'Tái lập baseline v2.0; đàm phán gia hạn hỗ trợ đến Q2/2028; tách go-live theo đợt', due: '2026-10-31', status: 'Đang xử lý' },
      { id: 'R-02', title: 'Chất lượng dữ liệu CIF thấp, chỉ 61% đạt chuẩn chuyển đổi', category: 'Dữ liệu', p: 5, i: 4, owner: 'Ngô Hải Yến', strategy: 'Giảm thiểu', response: 'Lập chiến dịch làm sạch dữ liệu tại chi nhánh; bổ sung quy tắc chuẩn hoá tự động', due: '2026-12-31', status: 'Đang xử lý' },
      { id: 'R-03', title: 'Phụ thuộc năng lực nhân sự của đối tác triển khai', category: 'Phụ thuộc ngoài', p: 4, i: 5, owner: 'Trịnh Văn Sơn', strategy: 'Chuyển giao', response: 'Bổ sung điều khoản SLA nhân sự vào hợp đồng; yêu cầu đối tác tăng 6 FTE senior', due: '2026-11-15', status: 'Đang xử lý' },
      { id: 'R-04', title: 'Coverage unit test 38%, dưới mức cam kết 60%', category: 'Chất lượng', p: 4, i: 3, owner: 'Bùi Đức Long', strategy: 'Giảm thiểu', response: 'Áp quality gate chặn merge khi coverage giảm; bổ sung 2 sprint trả nợ kỹ thuật', due: '2026-12-15', status: 'Đang xử lý' },
      { id: 'R-05', title: 'Chi phí vượt dự toán 24% do ba yêu cầu thay đổi đã duyệt', category: 'Chi phí', p: 4, i: 4, owner: 'Trịnh Văn Sơn', strategy: 'Giảm thiểu', response: 'Trình điều chỉnh tổng mức đầu tư; rà soát cắt giảm hạng mục chưa cam kết', due: '2026-11-30', status: 'Đang xử lý' },
      { id: 'R-06', title: 'Còn 6 khuyến nghị ATTT chưa đóng, chặn phê duyệt kiến trúc', category: 'Bảo mật & tuân thủ', p: 3, i: 4, owner: 'Vũ Thị Mai', strategy: 'Giảm thiểu', response: 'Lập kế hoạch đóng từng khuyến nghị theo tuần, báo cáo ARB tháng 11', due: '2026-11-20', status: 'Đang xử lý' },
      { id: 'R-07', title: 'Nguy cơ gián đoạn vận hành khi chuyển đổi dữ liệu thật', category: 'Vận hành', p: 3, i: 5, owner: 'Ngô Hải Yến', strategy: 'Giảm thiểu', response: 'Ba vòng diễn tập chuyển đổi, phương án rollback trong 4 giờ', due: '2027-05-31', status: 'Mới ghi nhận' },
      { id: 'R-08', title: 'Thiếu môi trường hiệu năng tương đương production', category: 'Kỹ thuật', p: 3, i: 3, owner: 'Trần Văn Nam', strategy: 'Giảm thiểu', response: 'Đề xuất đầu tư môi trường performance 60% capacity production', due: '2026-12-31', status: 'Mới ghi nhận' },
      { id: 'R-09', title: 'Thay đổi quy định báo cáo NHNN trong quá trình triển khai', category: 'Bảo mật & tuân thủ', p: 2, i: 4, owner: 'Phan Thanh Tùng', strategy: 'Chấp nhận', response: 'Theo dõi dự thảo quy định; dự phòng 20 ngày trong kế hoạch', due: '2027-01-31', status: 'Theo dõi' },
      { id: 'R-10', title: 'Nhân sự nội bộ nghỉ việc trong giai đoạn cao điểm', category: 'Nhân sự', p: 3, i: 3, owner: 'Phan Thanh Tùng', strategy: 'Giảm thiểu', response: 'Chính sách giữ người cho 8 vị trí then chốt; tài liệu hoá tri thức', due: '2026-12-31', status: 'Đang xử lý' }
    ],
    issues: [
      { id: 'I-01', title: 'Đối tác triển khai thiếu 6 FTE senior so với cam kết hợp đồng', impact: 'Module tín dụng chậm 8 tuần', owner: 'Trịnh Văn Sơn', since: '2026-08-14', status: 'Đang xử lý', severity: 'Cao' },
      { id: 'I-02', title: 'Chưa duyệt được phương án rollback, ARB treo phê duyệt kiến trúc', impact: 'Chặn hoàn tất giai đoạn thiết kế', owner: 'Bùi Đức Long', since: '2026-09-30', status: 'Đang xử lý', severity: 'Cao' },
      { id: 'I-03', title: 'Môi trường SIT core thiếu dung lượng cho bộ dữ liệu đầy đủ', impact: 'Chỉ test được 30% dữ liệu mẫu', owner: 'Trần Văn Nam', since: '2026-09-10', status: 'Chờ xử lý', severity: 'Trung bình' },
      { id: 'I-04', title: 'Chất lượng CIF tại 12 chi nhánh dưới 40%', impact: 'Không đủ điều kiện chuyển đổi đợt 1', owner: 'Ngô Hải Yến', since: '2026-07-22', status: 'Đang xử lý', severity: 'Cao' }
    ],
    quality: {
      defectDensity: 3.4, defectDensityTarget: 2.0,
      defectTotal: 638, defectOpen: 214, defectCriticalOpen: 17,
      leakageUat: 0, leakageUatTarget: 10,
      leakageProd: 0, leakageProdTarget: 1.0,
      passRate: 71.5, passRateTarget: 95,
      reworkRate: 16.2, reworkRateTarget: 5,
      coverage: 38, coverageTarget: 60,
      trendDefect: [52, 68, 94, 121, 148, 173, 196, 214],
      trendPass: [58, 61, 63, 66, 68, 69, 71, 71.5],
      reviews: [
        { phase: 'Khởi tạo', date: '2025-07-04', result: 'Đạt', note: '' },
        { phase: 'Phân tích & thiết kế', date: '2026-09-30', result: 'Không đạt', note: 'ARB treo phê duyệt: thiếu phương án rollback, 6 khuyến nghị ATTT chưa đóng' },
        { phase: 'Phát triển', date: '', result: 'Chưa đánh giá', note: 'Coverage 38% dưới cam kết 60%' },
        { phase: 'Kiểm thử', date: '', result: 'Chưa đánh giá', note: '' }
      ],
      cost: { planned: 128000, approvedExtra: 9500, actual: 61400, committed: 142300 },
      ttm: { cntt: 'Không áp dụng', e2e: 'Không áp dụng', avgDays: null, targetDays: 40, epicCount: 0, epicLate: 0 },
      postGolive: 'Chưa đánh giá — dự kiến đo sau go-live Q4/2027.'
    }
  };

  /* ====================== PROJECT: DLH (mới khai báo, chưa chạy) ========= */
  const DLH = {
    id: 'DLH', code: 'DLH', name: 'Data Lakehouse nền tảng phân tích',
    hasDetail: false,
    status: 'Mới khai báo', health: 'Chưa đánh giá',
    type: 'Dự án', form: 'Yêu cầu phát triển', priority: 'Khối',
    domain: 'Dữ liệu & Phân tích', leader: 'Nguyễn Minh Châu',
    startDate: '2026-11-02', endDate: '2027-10-29',
    currentPhase: 'Khởi tạo',
    progressActual: 0, progressExpected: 0,
    shareDisabled: false,
    context: 'Dữ liệu phân tích đang phân tán trên 6 kho riêng lẻ, báo cáo lãnh đạo mất 3-5 ngày để tổng hợp.',
    objective: 'Xây dựng nền tảng data lakehouse tập trung phục vụ báo cáo và mô hình phân tích.',
    scopeText: 'Nạp dữ liệu từ core, thẻ, CRM và kênh số; cung cấp 25 báo cáo quản trị chuẩn.',
    people: { pd: 'Nguyễn Minh Châu', td: 'Đặng Quốc Việt', pm: 'Hà Thu Trang' },
    members: [
      { role: 'Data Engineer', dept: 'Trung tâm Phân tích dữ liệu', fte: 10 },
      { role: 'BA', dept: 'BA Dữ liệu', fte: 4 },
      { role: 'Test', dept: 'Kiểm thử dữ liệu', fte: 3 }
    ],
    okr: [
      { obj: 'Rút ngắn thời gian ra báo cáo quản trị', kr: 'Dưới 4 giờ thay vì 3-5 ngày', result: '', pct: 0 },
      { obj: 'Tập trung nguồn dữ liệu phân tích', kr: '6 kho dữ liệu hợp nhất về 1 nền tảng', result: '', pct: 0 }
    ],
    external: { jiraKey: '', jiraUrl: '#', opmsDemand: 'OPMS-DM-2026-0904', ttmEnabled: false },
    schedule: { groups: [], milestones: [] },
    checklist: ckState(['CK01|doing|Nguyễn Minh Châu|2026-10-20|Đang hoàn thiện hồ sơ khởi tạo']),
    scope: { baselineVersion: '—', baselineDate: '', baselineDays: 362, items: [], crs: [] },
    risks: [], issues: [],
    quality: null
  };

  /* ======== Dự án "nhẹ" — chỉ phục vụ danh mục + dashboard, không có tab chi tiết ==== */
  function lite(o) {
    return Object.assign({
      hasDetail: false, type: 'Dự án', form: 'Yêu cầu phát triển', priority: 'Khối',
      currentPhase: '—', shareDisabled: false,
      context: '', objective: '', scopeText: '', okr: [],
      external: { jiraKey: '', jiraUrl: '#', opmsDemand: '', ttmEnabled: false },
      schedule: { groups: [], milestones: [] }, checklist: {},
      scope: { baselineVersion: '—', baselineDate: '', baselineDays: 1, items: [], crs: [] },
      risks: [], issues: [], quality: null
    }, o);
  }

  const LITE = [
    lite({
      id: 'CARD', code: 'CARD', name: 'Nâng cấp hệ thống thẻ', status: 'Đang triển khai', health: 'Tốt',
      domain: 'Thẻ & Thanh toán', priority: 'Ngân hàng', form: 'Yêu cầu nâng cấp hệ thống',
      leader: 'Trịnh Văn Sơn', startDate: '2026-02-02', endDate: '2027-03-31',
      currentPhase: 'Phát triển', progressActual: 38, progressExpected: 35,
      people: { pd: 'Trịnh Văn Sơn', td: 'Lương Chí Bảo', pm: 'Vũ Đình Hoà' },
      members: [{ role: 'Dev', dept: 'Phòng tích hợp', fte: 9 }, { role: 'Test', dept: 'Kiểm thử Ứng dụng số', fte: 5 }],
      risks: [{ id: 'R-01', title: 'Phụ thuộc lịch chứng nhận của tổ chức thẻ quốc tế', category: 'Phụ thuộc ngoài', p: 3, i: 3, owner: 'Vũ Đình Hoà', strategy: 'Chấp nhận', response: 'Đăng ký slot chứng nhận sớm từ Q1/2027', due: '2027-01-31', status: 'Theo dõi' }]
    }),
    lite({
      id: 'LOAN', code: 'LOAN', name: 'Số hoá quy trình cấp tín dụng', status: 'Đang triển khai', health: 'Cần chú ý',
      domain: 'Khách hàng doanh nghiệp', priority: 'Ngân hàng',
      leader: 'Nguyễn Minh Châu', startDate: '2025-09-01', endDate: '2026-12-31',
      currentPhase: 'Kiểm thử', progressActual: 69, progressExpected: 78,
      people: { pd: 'Nguyễn Minh Châu', td: 'Đặng Quốc Việt', pm: 'Mai Thuỳ Dương' },
      members: [{ role: 'Dev', dept: 'Phòng Giải pháp quản trị nội bộ', fte: 11 }, { role: 'BA', dept: 'BA Dịch vụ số', fte: 4 }, { role: 'Test', dept: 'Kiểm thử Ứng dụng số', fte: 4 }],
      risks: [{ id: 'R-01', title: 'Quy trình phê duyệt tín dụng thay đổi giữa kỳ triển khai', category: 'Tiến độ', p: 4, i: 4, owner: 'Mai Thuỳ Dương', strategy: 'Giảm thiểu', response: 'Đóng băng quy trình phê duyệt đến khi go-live', due: '2026-11-30', status: 'Đang xử lý' }]
    }),
    lite({
      id: 'CRM', code: 'CRM', name: 'CRM 360 khách hàng', status: 'Tạm dừng', health: 'Chưa đánh giá',
      domain: 'Khách hàng cá nhân', leader: 'Lê Hồng Vân', startDate: '2026-03-02', endDate: '2027-06-30',
      currentPhase: 'Phân tích', progressActual: 22, progressExpected: 45,
      people: { pd: 'Lê Hồng Vân', td: 'Hoàng Minh Khôi', pm: 'Lý Trung Kiên' },
      members: [{ role: 'BA', dept: 'BA Khách hàng cá nhân', fte: 3 }],
      risks: [{ id: 'R-01', title: 'Dự án tạm dừng chờ phê duyệt lại tổng mức đầu tư', category: 'Chi phí', p: 3, i: 4, owner: 'Lý Trung Kiên', strategy: 'Giảm thiểu', response: 'Trình lại phương án đầu tư trong Q4/2026', due: '2026-12-15', status: 'Đang xử lý' }]
    }),
    lite({
      id: 'BIZ3', code: 'BIZ3', name: 'BizApp phiên bản 3', status: 'Hoàn thành', health: 'Tốt',
      domain: 'Khách hàng doanh nghiệp', leader: 'Nguyễn Minh Châu',
      startDate: '2025-01-06', endDate: '2026-06-30', currentPhase: 'Đã đóng',
      progressActual: 100, progressExpected: 100,
      people: { pd: 'Nguyễn Minh Châu', td: 'Đặng Quốc Việt', pm: 'Nguyễn Hữu Phước' },
      members: [{ role: 'Dev', dept: 'Phòng Ứng dụng số', fte: 8 }, { role: 'Test', dept: 'Kiểm thử Ứng dụng số', fte: 3 }]
    }),
    lite({
      id: 'ESIGN', code: 'ESIGN', name: 'Hợp đồng điện tử eSign', status: 'Mới khai báo', health: 'Chưa đánh giá',
      domain: 'Khách hàng cá nhân', leader: 'Lê Hồng Vân',
      startDate: '2026-11-16', endDate: '2027-08-31', currentPhase: 'Khởi tạo',
      progressActual: 0, progressExpected: 0,
      people: { pd: 'Lê Hồng Vân', td: 'Hoàng Minh Khôi', pm: 'Đào Khánh Linh' },
      members: [{ role: 'BA', dept: 'BA Khách hàng cá nhân', fte: 2 }]
    }),
    lite({
      id: 'OPEN', code: 'OPEN', name: 'Open API Banking Hub', status: 'Đang triển khai', health: 'Tốt',
      domain: 'Chuyển tiền', leader: 'Đỗ Diệu Hằng',
      startDate: '2026-04-01', endDate: '2027-02-26', currentPhase: 'Phát triển',
      progressActual: 52, progressExpected: 50,
      people: { pd: 'Đỗ Diệu Hằng', td: 'Nguyễn Thanh Cao', pm: 'Tạ Quang Minh' },
      members: [{ role: 'Dev', dept: 'Phòng tích hợp', fte: 7 }, { role: 'BA', dept: 'BA Dịch vụ số', fte: 2 }]
    })
  ];

  const projects = [PMP, EKYC, CBU, DLH].concat(LITE);

  /* --- Dự án do wizard (màn 03) tạo ra: giữ trong sessionStorage để các màn
         khác cùng tab nhìn thấy. Đóng tab là mất — đúng tinh thần mockup. ---- */
  const SESSION_KEY = 'mb-mockup-new-projects';
  function sessionProjects() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); } catch (e) { return []; }
  }
  function addProject(p) {
    const list = sessionProjects();
    list.push(p);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(list));
    projects.push(lite(p));
  }
  /** đổi trạng thái 1 dự án đã khai báo (dùng khi PM bắt đầu triển khai) */
  function setProjectStatus(id, status) {
    const list = sessionProjects().map((p) => (p.id === id ? Object.assign({}, p, { status: status }) : p));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(list));
    const p = project(id);
    if (p) p.status = status;
  }
  sessionProjects().forEach((p) => projects.push(lite(p)));

  /* ======================================================== DERIVATIONS == */
  function project(id) { return projects.find((p) => p.id === id) || null; }

  function progress(p) {
    return {
      actual: p.progressActual,
      expected: p.progressExpected,
      delta: p.progressActual - p.progressExpected
    };
  }

  /* tone = class st-* của Badge trạng thái trong ias-design */
  /* Vòng đời dự án trong phạm vi module: khai báo → triển khai → (tạm dừng) →
     hoàn thành. Không có bước phê duyệt — module dừng ở mức khai báo dữ liệu. */
  const STATUS_TONE = {
    'Mới khai báo': 'purple',
    'Đang triển khai': 'blue',
    'Tạm dừng': 'neutral',
    'Hoàn thành': 'success'
  };
  function statusTone(s) { return STATUS_TONE[s] || 'neutral'; }

  const HEALTH_TONE = {
    'Tốt': 'success',
    'Cần chú ý': 'warning',
    'Rủi ro cao': 'error',
    'Chưa đánh giá': 'neutral'
  };
  function healthTone(h) { return HEALTH_TONE[h] || 'neutral'; }

  /** tone cho thanh Progress theo mức lệch tiến độ */
  function progressTone(delta) { return delta >= -3 ? 'ok' : (delta < -10 ? 'bad' : 'warn'); }

  /* ---------------------------------------------------------- checklist -- */
  const CK_STATUS = {
    done: { label: 'Hoàn thành', variant: 'success', icon: 'check' },
    doing: { label: 'Đang làm', variant: 'info', icon: 'dots-three' },
    todo: { label: 'Chưa làm', variant: 'neutral', icon: '' },
    na: { label: 'Không áp dụng', variant: 'neutral', icon: 'minus' }
  };

  /** trả về danh sách item đã merge template + state của project */
  function checklistItems(p) {
    return CHECKLIST_TEMPLATE.map((t) => {
      const s = p.checklist[t.id] || { status: 'todo', owner: '', due: '', evidence: '', note: '' };
      return Object.assign({}, t, s, {
        overdue: s.status !== 'done' && s.status !== 'na' && MBUtil.isOverdue(s.due)
      });
    }).concat(p.extraChecklist || []);
  }

  function checklistStats(items) {
    const counted = items.filter((i) => i.status !== 'na');
    const done = counted.filter((i) => i.status === 'done').length;
    return {
      total: items.length,
      counted: counted.length,
      done: done,
      doing: items.filter((i) => i.status === 'doing').length,
      todo: items.filter((i) => i.status === 'todo').length,
      na: items.filter((i) => i.status === 'na').length,
      overdue: items.filter((i) => i.overdue).length,
      pct: counted.length ? Math.round((done / counted.length) * 100) : 0
    };
  }

  /* -------------------------------------------------------------- scope -- */
  function scopeStats(p) {
    const approved = p.scope.crs.filter((c) => c.status === 'Đã duyệt');
    const pending = p.scope.crs.filter((c) => c.status === 'Chờ duyệt');
    const days = MBUtil.sum(approved, (c) => c.days);
    const cost = MBUtil.sum(approved, (c) => c.cost);
    const fte = MBUtil.sum(approved, (c) => c.fte);
    const base = p.scope.baselineDays || 1;
    return {
      approved, pending,
      addedDays: days, addedCost: cost, addedFte: fte,
      pendingDays: MBUtil.sum(pending, (c) => c.days),
      pendingCost: MBUtil.sum(pending, (c) => c.cost),
      creepPct: Math.round((days / base) * 1000) / 10,
      inScope: p.scope.items.filter((i) => i.type === 'in').length,
      outScope: p.scope.items.filter((i) => i.type === 'out').length,
      addedItems: p.scope.items.filter((i) => /CR-/.test(i.note || '')).length
    };
  }

  /* --------------------------------------------------------------- risk -- */
  function riskLevel(score) {
    if (score >= 20) return { label: 'Nghiêm trọng', cls: 'heat-crit', tone: 'error' };
    if (score >= 12) return { label: 'Cao', cls: 'heat-high', tone: 'error' };
    if (score >= 6) return { label: 'Trung bình', cls: 'heat-med', tone: 'warning' };
    return { label: 'Thấp', cls: 'heat-low', tone: 'success' };
  }
  function riskScore(r) { return r.p * r.i; }
  function openRisks(p) { return p.risks.filter((r) => r.status !== 'Đã đóng'); }
  function highRisks(p) { return openRisks(p).filter((r) => riskScore(r) >= 12); }

  const RISK_P_LABEL = ['Rất thấp', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];
  const RISK_I_LABEL = ['Không đáng kể', 'Nhẹ', 'Trung bình', 'Nặng', 'Nghiêm trọng'];
  const RISK_CATEGORIES = ['Tiến độ', 'Kỹ thuật', 'Dữ liệu', 'Chi phí', 'Nhân sự',
    'Bảo mật & tuân thủ', 'Phụ thuộc ngoài', 'Vận hành', 'Chất lượng'];
  const RISK_STRATEGIES = ['Giảm thiểu', 'Chấp nhận', 'Chuyển giao', 'Loại bỏ'];
  const RISK_STATUSES = ['Mới ghi nhận', 'Đang xử lý', 'Theo dõi', 'Đã đóng'];

  /* ----------------------------------------------------------- schedule -- */
  /** gộp toàn bộ task của mọi group */
  function allTasks(p) {
    return p.schedule.groups.reduce((a, g) => a.concat(g.tasks), []);
  }
  function taskSlip(t) { return MBUtil.diffDays(t.baseEnd, t.end); }
  function groupRange(g) {
    const s = g.tasks.map((t) => t.start).sort()[0];
    const e = g.tasks.map((t) => t.end).sort().slice(-1)[0];
    const bs = g.tasks.map((t) => t.baseStart).sort()[0];
    const be = g.tasks.map((t) => t.baseEnd).sort().slice(-1)[0];
    const pct = g.tasks.length ? Math.round(MBUtil.sum(g.tasks, (t) => t.pct) / g.tasks.length) : 0;
    return { start: s, end: e, baseStart: bs, baseEnd: be, pct: pct };
  }
  function scheduleStats(p) {
    const ms = p.schedule.milestones;
    const late = ms.filter((m) => m.status === 'late');
    const next = ms.filter((m) => m.status !== 'done')
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
    const tasks = allTasks(p);
    const maxSlip = tasks.length ? Math.max.apply(null, tasks.map(taskSlip)) : 0;
    const finishSlip = ms.length ? MBUtil.diffDays(ms[ms.length - 1].baseDate, ms[ms.length - 1].date) : 0;
    return {
      milestoneTotal: ms.length, milestoneLate: late.length, milestoneDone: ms.filter((m) => m.status === 'done').length,
      next: next, maxSlip: maxSlip, finishSlip: finishSlip,
      taskTotal: tasks.length, taskLate: tasks.filter((t) => taskSlip(t) > 0 && t.pct < 100).length
    };
  }

  /* ------------------------------------------------------- portfolio KPI-- */
  function portfolio() {
    const active = projects.filter((p) => p.status === 'Đang triển khai');
    return {
      total: projects.length,
      active: active.length,
      onTrack: active.filter((p) => progress(p).delta >= -3).length,
      late: active.filter((p) => progress(p).delta < -3).length,
      highRisk: active.filter((p) => p.health === 'Rủi ro cao').length,
      declared: projects.filter((p) => p.status === 'Mới khai báo').length,
      paused: projects.filter((p) => p.status === 'Tạm dừng').length,
      done: projects.filter((p) => p.status === 'Hoàn thành').length,
      totalFte: MBUtil.sum(projects, (p) => MBUtil.sum(p.members, (m) => m.fte)),
      totalPlannedCost: MBUtil.sum(projects.filter((p) => p.quality), (p) => p.quality.cost.planned),
      totalCommittedCost: MBUtil.sum(projects.filter((p) => p.quality), (p) => p.quality.cost.committed)
    };
  }

  /** tất cả rủi ro mở của toàn danh mục, sắp theo điểm giảm dần */
  function topRisks(n) {
    const out = [];
    projects.forEach((p) => openRisks(p).forEach((r) => out.push(Object.assign({ project: p }, r))));
    out.sort((a, b) => riskScore(b) - riskScore(a));
    return n ? out.slice(0, n) : out;
  }

  const DOMAINS = ['Chuyển tiền', 'Khách hàng cá nhân', 'Core & Kênh phân phối', 'Dữ liệu & Phân tích',
    'Khách hàng doanh nghiệp', 'Thẻ & Thanh toán'];
  const PROJECT_TYPES = ['Dự án', 'Team Agile', 'Sáng kiến'];
  const FORMS = ['Yêu cầu phát triển', 'Yêu cầu nâng cấp hệ thống', 'Mua sắm & triển khai', 'Nghiên cứu khả thi'];
  const PRIORITIES = ['Ngân hàng', 'Khối', 'Phòng'];
  const STATUSES = ['Mới khai báo', 'Đang triển khai', 'Tạm dừng', 'Hoàn thành'];
  const ROLES = ['Dev', 'BA', 'Test', 'DevOps', 'DBA', 'Data Engineer', 'PO', 'Scrum Master'];
  const DEPARTMENTS = ['Phòng tích hợp', 'Phòng Giải pháp quản trị nội bộ', 'BA Dịch vụ số',
    'Kiểm thử Ứng dụng số', 'Phòng Ứng dụng số', 'Trung tâm Core Banking', 'Trung tâm hạ tầng',
    'Trung tâm Phân tích dữ liệu', 'Đối tác triển khai'];

  return {
    projects, project, progress, statusTone, healthTone, progressTone,
    PHASES, CHECKLIST_TEMPLATE, CK_STATUS, checklistItems, checklistStats,
    scopeStats,
    riskLevel, riskScore, openRisks, highRisks,
    RISK_P_LABEL, RISK_I_LABEL, RISK_CATEGORIES, RISK_STRATEGIES, RISK_STATUSES,
    allTasks, taskSlip, groupRange, scheduleStats,
    portfolio, topRisks, addProject, setProjectStatus,
    DOMAINS, PROJECT_TYPES, FORMS, PRIORITIES, STATUSES, ROLES, DEPARTMENTS
  };
})();
