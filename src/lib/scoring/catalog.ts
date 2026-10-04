/**
 * Epic Scoring Service — badge catalog: the single source of truth for the Axis → FindingGroup →
 * Badge model (docs/superpowers/specs/2026-09-29-scoring-service-design.md). Every badge belongs to
 * exactly one axis and exactly one finding group; rules only ever emit a badge id, so a badge's
 * group/axis/label/formula live here and nowhere else. The "Logic cảnh báo" popup
 * (components/layout/HelpPanels.tsx) renders straight from this file.
 *
 * Pure data (no pool/db import) so both client and server can import it.
 */

export type FindingGroup = 'ALERT' | 'PASS' | 'FAIL' | 'RECOMMENDATION' | 'NOTE';
export type ScoringAxis = 'TTM_CNTT' | 'TTM_E2E' | 'RELEASE' | 'PHASE' | 'DATA_QUALITY' | 'SCOPE';

export interface FindingGroupDefinition {
  id: FindingGroup;
  label: string;
  description: string;
}

export interface ScoringAxisDefinition {
  id: ScoringAxis;
  label: string;
  description: string;
}

export interface BadgeDefinition {
  readonly id: string;
  readonly axis: ScoringAxis;
  readonly group: FindingGroup;
  readonly label: string;
  /** Display order within the axis — lower wins when an app shows only one badge per axis. */
  readonly precedence: number;
  readonly meaning: string;
  readonly formula: string;
  /** Legacy function/field producing the equivalent result today (parity check), if any. */
  readonly legacySource?: string;
  /** false = the rule ships disabled until enabled in scoring_rule_settings. */
  readonly defaultEnabled: boolean;
  /** Core gates can't be disabled — turning them off would let an unreliable verdict through. */
  readonly core?: boolean;
}

export const FINDING_GROUPS: FindingGroupDefinition[] = [
  { id: 'FAIL', label: 'Đánh giá Fail', description: 'Epic đã không đạt một tiêu chí — kết quả khách quan, không thể "cứu" bằng cách làm nhanh hơn.' },
  { id: 'ALERT', label: 'Cảnh báo', description: 'Rủi ro đang diễn ra hoặc dữ liệu có vấn đề cần chú ý; chưa phải kết luận không đạt.' },
  { id: 'RECOMMENDATION', label: 'Khuyến nghị', description: 'Việc cụ thể người phụ trách nên làm (cập nhật status, bổ sung trường, xử lý Epic Pending…).' },
  { id: 'PASS', label: 'Đánh giá Đạt', description: 'Epic đã hoàn thành một tiêu chí đúng hạn theo rule.' },
  { id: 'NOTE', label: 'Ghi nhận', description: 'Thông tin trung tính — không phải cảnh báo hay đánh giá (ví dụ: ngoài phạm vi, không tính được, pha hiện tại).' },
];

export const SCORING_AXES: ScoringAxisDefinition[] = [
  { id: 'TTM_CNTT', label: 'TTM-CNTT (QLDA)', description: 'T1 (Start Date) → R4G Date so với ngân sách ngày làm việc TTM-CNTT (QLDA).' },
  { id: 'TTM_E2E', label: 'TTM-E2E', description: 'T0 (Idea Approved Date) → R4G Date (hoặc Due Date theo policy) so với ngân sách TTM-E2E.' },
  { id: 'RELEASE', label: 'Release', description: 'Kỷ luật Due Date / status Released so với R4G Date + thời hạn grace.' },
  { id: 'PHASE', label: 'Pha', description: '5 pha DESIGN / DEV / TEST / PENTEST / R4GOLIVE, mỗi pha có baseline theo % ngân sách TTM-CNTT (QLDA).' },
  { id: 'DATA_QUALITY', label: 'Chất lượng dữ liệu', description: 'Dữ liệu Jira thiếu hoặc mâu thuẫn. Badge Cảnh báo của axis này = "Sai lệch dữ liệu".' },
  { id: 'SCOPE', label: 'Phạm vi', description: 'Epic có nằm trong "Phạm vi dữ liệu cho TTM" (Cấu hình cảnh báo) hay không.' },
];

export const BADGES = [
  // ---------- TTM_CNTT ----------
  {
    id: 'CNTT_CALC_BROKEN', axis: 'TTM_CNTT', group: 'NOTE', label: 'Không tính được', precedence: 10, defaultEnabled: true, core: true,
    meaning: 'Không đủ dữ liệu tin cậy để tính TTM-CNTT (QLDA); mọi badge TTM-CNTT (QLDA) khác bị che.',
    formula: 'T1 trống  HOẶC  R4G < T1',
    legacySource: 'breaksTtmCnttCalculation',
  },
  {
    id: 'CNTT_STATUS_MISMATCH', axis: 'TTM_CNTT', group: 'RECOMMENDATION', label: 'Sai Status', precedence: 20, defaultEnabled: true,
    meaning: 'R4G Date đã tới và đúng hạn nhưng status Epic chưa lên R4GOLIVE — cần chuyển status sang R4GOLIVE. Epic vẫn được tính "Đạt TTM-CNTT (QLDA)"; badge này hiện kèm bên cạnh. Từ 04/10/2026 trường hợp này là Sai lệch dữ liệu (R8) nên badge chỉ còn hiện khi rule R8 bị tắt.',
    formula: 'Không Sai lệch dữ liệu  VÀ  R4G ≤ asOf  VÀ  R4G ≤ Target_CNTT  VÀ  status < R4GOLIVE',
    legacySource: 'resolveTtmCnttStatusMismatch',
  },
  {
    id: 'CNTT_FAIL', axis: 'TTM_CNTT', group: 'FAIL', label: 'Fail TTM-CNTT (QLDA)', precedence: 30, defaultEnabled: true,
    meaning: 'Đã vượt ngân sách TTM-CNTT (QLDA).',
    formula: 'Không Sai lệch dữ liệu  VÀ  ( Có R4G: R4G > Target_CNTT.  Chưa có R4G: asOf > Target_CNTT ).   Target_CNTT = T1 +wd (N_CNTT − 1)  (Start Date là ngày 1)',
    legacySource: 'computeTtmAlert → FAIL',
  },
  {
    id: 'CNTT_LATE', axis: 'TTM_CNTT', group: 'ALERT', label: 'Cảnh báo muộn', precedence: 40, defaultEnabled: true,
    meaning: 'Chưa có R4G Date, đã qua mốc cảnh báo muộn của status hiện tại, chưa quá Target.',
    formula: 'Không Sai lệch dữ liệu  VÀ  R4G trống  VÀ  T1 +wd Offset_muộn(loại Epic, status) ≤ asOf ≤ Target_CNTT',
    legacySource: 'computeTtmAlert → LATE',
  },
  {
    id: 'CNTT_PASS', axis: 'TTM_CNTT', group: 'PASS', label: 'Đạt TTM-CNTT (QLDA)', precedence: 60, defaultEnabled: true,
    meaning: 'Đã tới R4G Date trong ngân sách. Status chưa lên R4GOLIVE vẫn tính Đạt (kèm badge "Sai Status"). R4G Date ở tương lai chưa được tính.',
    formula: 'Không Sai lệch dữ liệu  VÀ  R4G ≤ asOf  VÀ  R4G ≤ Target_CNTT',
    legacySource: 'isTtmCnttAchieved (3 page)',
  },
  {
    id: 'CNTT_NOT_APPLICABLE', axis: 'TTM_CNTT', group: 'NOTE', label: 'Không áp dụng', precedence: 90, defaultEnabled: true, core: true,
    meaning: 'Epic đã Cancelled — không đánh giá TTM-CNTT (QLDA).',
    formula: 'status = Cancelled',
    legacySource: 'computeTtmAlert → NONE',
  },

  // ---------- TTM_E2E ----------
  {
    id: 'E2E_CALC_BROKEN', axis: 'TTM_E2E', group: 'NOTE', label: 'Không tính được', precedence: 10, defaultEnabled: true, core: true,
    meaning: 'R4G Date phi logic so với T0; badge TTM-E2E khác bị che.',
    formula: 'Idea Approved Date có giá trị  VÀ  R4G < Idea Approved Date',
    legacySource: 'breaksTtmE2eCalculation',
  },
  {
    id: 'E2E_FAIL', axis: 'TTM_E2E', group: 'FAIL', label: 'Fail TTM-E2E', precedence: 30, defaultEnabled: true,
    meaning: 'Đã vượt ngân sách TTM-E2E.',
    formula: 'Không Sai lệch dữ liệu  VÀ  ( Có ngày kết thúc: ngày đó > Target_E2E.  Chưa có: asOf > Target_E2E ).   Target_E2E = T0 +wd (N_E2E − 1);  ngày kết thúc = R4G (hoặc Due nếu "Tiêu chí Time to Market" cấu hình to_ttm_field = DUE_DATE)',
    legacySource: 'resolveTtmE2eRelease → FAIL',
  },
  {
    id: 'E2E_PASS', axis: 'TTM_E2E', group: 'PASS', label: 'Đạt TTM-E2E', precedence: 60, defaultEnabled: true,
    meaning: 'T0 → ngày kết thúc (R4G Date) trong ngân sách TTM-E2E và ngày đó đã tới. Status chưa lên R4GOLIVE vẫn tính Đạt (kèm badge "Sai Status"). Ngày ở tương lai chưa được tính.',
    formula: 'Không Sai lệch dữ liệu  VÀ  ngày kết thúc ≤ asOf  VÀ  ngày kết thúc ≤ Target_E2E',
    legacySource: 'isTtmE2eAchieved (3 page)',
  },
  {
    id: 'E2E_STATUS_MISMATCH', axis: 'TTM_E2E', group: 'RECOMMENDATION', label: 'Sai Status', precedence: 65, defaultEnabled: true,
    meaning: 'TTM-E2E đã Đạt theo ngày ghi nhận nhưng status Epic chưa lên R4GOLIVE — cần chuyển status. Hiện kèm "Đạt TTM-E2E". Từ 04/10/2026 trường hợp có R4G Date là Sai lệch dữ liệu (R8) nên badge chỉ còn hiện khi rule R8 bị tắt hoặc ngày kết thúc lấy theo Due Date.',
    formula: 'Có "Đạt TTM-E2E"  VÀ  status < R4GOLIVE',
  },
  {
    id: 'REC_FILL_IDEA_APPROVED_DATE', axis: 'TTM_E2E', group: 'RECOMMENDATION', label: 'Bổ sung T0', precedence: 80, defaultEnabled: true,
    meaning: 'Bổ sung Idea Approved Date để TTM-E2E tính đúng mốc gốc.',
    formula: 'Có badge "Baseline từ ngày tạo Jira"  VÀ  không Cancelled',
  },
  {
    id: 'E2E_BASELINE_FROM_JIRA_CREATED', axis: 'TTM_E2E', group: 'NOTE', label: 'Baseline từ ngày tạo Jira', precedence: 95, defaultEnabled: true,
    meaning: 'Thiếu Idea Approved Date nên T0 lấy ngày tạo Epic trên Jira.',
    formula: 'Idea Approved Date trống → T0 = ngày tạo Jira',
    legacySource: 'baselineSourceLabel',
  },

  // ---------- RELEASE ----------
  {
    id: 'RELEASE_JUSTIFY_GOLIVE', axis: 'RELEASE', group: 'FAIL', label: 'Giải trình Golive', precedence: 20, defaultEnabled: true,
    meaning: 'Golive vượt thời hạn grace sau R4G — cần giải trình.',
    formula: 'Có R4G  VÀ  ( Due > R4G +wd G   HOẶC   Due trống VÀ asOf > R4G +wd G )',
    legacySource: 'resolveReleaseAxis → JUSTIFY_GOLIVE',
  },
  {
    id: 'RELEASE_STATUS_MISMATCH', axis: 'RELEASE', group: 'RECOMMENDATION', label: 'Sai Status', precedence: 30, defaultEnabled: true,
    meaning: 'Due Date đúng hạn nhưng status chưa Released — cần chuyển status sang Released. Trước đây là rule R7 "Sai lệch dữ liệu"; nay không còn tính là Sai lệch dữ liệu.',
    formula: 'status ∉ {Cancelled, To Do, In PO, Backlog}  VÀ  Có R4G  VÀ  Due ≤ R4G +wd G  VÀ  status ≠ RELEASED',
    legacySource: 'evaluateEpicDataAnomaly R7',
  },
  {
    id: 'RELEASE_WAITING_GOLIVE', axis: 'RELEASE', group: 'ALERT', label: 'Chờ golive', precedence: 40, defaultEnabled: true,
    meaning: 'Epic đã lên R4GOLIVE, hoặc đã Released mà chưa ghi Due Date — đang chờ hoàn tất thủ tục golive. Chỉ tính trong "Phạm vi dữ liệu cho TTM" (QLDA — che bởi SCOPE_CNTT_OUT); không phụ thuộc R4G Date/hạn grace nên có thể cùng active với "Giải trình Golive".',
    formula: 'Trong Phạm vi TTM-CNTT (QLDA)  VÀ  ( status = R4GOLIVE  HOẶC  (status = RELEASED  VÀ  Due trống) )',
    legacySource: 'resolveReleaseAxis → WAITING_GOLIVE (rule đổi 2026-10-01)',
  },
  {
    id: 'REC_PREPARE_GOLIVE_JUSTIFICATION', axis: 'RELEASE', group: 'RECOMMENDATION', label: 'Chuẩn bị giải trình', precedence: 60, defaultEnabled: true,
    meaning: 'Chuẩn bị nội dung giải trình Golive trễ hạn.',
    formula: 'Có badge "Giải trình Golive"',
  },
  {
    id: 'RELEASE_ON_TIME', axis: 'RELEASE', group: 'PASS', label: 'Release đúng hạn', precedence: 70, defaultEnabled: false,
    meaning: 'Đã Released với Due Date trong thời hạn grace. Mới — mặc định TẮT.',
    formula: 'Có R4G  VÀ  Due ≤ R4G +wd G  VÀ  status = RELEASED',
  },

  // ---------- DATA_QUALITY ----------
  {
    id: 'ANOMALY_R1_MISSING_START_DATE', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Thiếu Start Date', precedence: 10, defaultEnabled: true,
    meaning: 'R1 — Epic đã từ DESIGN trở đi (Design / In Progress / R4GOLIVE / MVP Done / Released) nhưng chưa có Start Date. Từ 04/10/2026 tính cả status DESIGN (trước đây từ DEV).',
    formula: 'status ≥ DESIGN  VÀ  không Pending  VÀ  T1 trống',
    legacySource: 'evaluateEpicDataAnomaly R1',
  },
  {
    id: 'ANOMALY_R3_DATE_OUT_OF_SEQUENCE', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Sai thứ tự ngày', precedence: 30, defaultEnabled: true,
    meaning: 'R3 — Các mốc ngày không theo đúng thứ tự.',
    formula: 'Vi phạm  T0 ≤ T1 < R4G ≤ Due  (chỉ xét mốc đã có giá trị; T0 = Idea Approved Date)',
    legacySource: 'evaluateEpicDataAnomaly R3',
  },
  {
    id: 'ANOMALY_R4_MISSING_REQUEST_TYPE', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Thiếu Phân loại yêu cầu', precedence: 40, defaultEnabled: true,
    meaning: 'R4 — Chưa có Phân loại yêu cầu.',
    formula: 'Phân loại yêu cầu trống hoặc "none"',
    legacySource: 'evaluateEpicDataAnomaly R4',
  },
  {
    id: 'ANOMALY_R5_MISSING_REQUIREMENT_LEVEL', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Thiếu Requirement Level', precedence: 50, defaultEnabled: true,
    meaning: 'R5 — Epic đã qua DESIGN nhưng chưa có Requirement Level. Từ 04/10/2026 không xét Epic đang ở status DESIGN.',
    formula: 'Requirement Level trống hoặc "none"  VÀ  status > DESIGN',
    legacySource: 'evaluateEpicDataAnomaly R5',
  },
  {
    id: 'ANOMALY_R6_SP_LEVEL_MISMATCH', axis: 'DATA_QUALITY', group: 'ALERT', label: 'SP nhưng Level thấp', precedence: 60, defaultEnabled: true,
    meaning: 'R6 — Loại Epic SP nhưng Requirement Level 1–2.',
    formula: 'Loại Epic ∈ {SP-Lv12, SP-Lv34}  VÀ  Requirement Level ∈ {1, 2}',
    legacySource: 'evaluateEpicDataAnomaly R6',
  },
  {
    id: 'ANOMALY_R8_R4G_DATE_BEFORE_R4GOLIVE', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Có R4G Date nhưng chưa R4GOLIVE', precedence: 62, defaultEnabled: true,
    meaning: 'R8 — Epic đã ghi R4G Date nhưng status chưa lên R4GOLIVE. Mới từ 04/10/2026; vì là Sai lệch dữ liệu nên Epic không được chấm Đạt / Fail / "Sai Status" trên các trục TTM cho tới khi sửa.',
    formula: 'Có R4G Date  VÀ  status < R4GOLIVE',
  },
  {
    id: 'ANOMALY_R9_MISSING_R4G_DATE', axis: 'DATA_QUALITY', group: 'ALERT', label: 'Thiếu R4G Date', precedence: 63, defaultEnabled: true,
    meaning: 'R9 — Epic đã ở status R4GOLIVE trở lên (R4GOLIVE / MVP Done / Released) nhưng chưa có R4G Date. Mới từ 04/10/2026.',
    formula: 'status ≥ R4GOLIVE  VÀ  không Pending  VÀ  R4G Date trống',
  },
  {
    id: 'ANOMALY_R2_PENDING_TOO_LONG', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Pending lâu', precedence: 65, defaultEnabled: true,
    meaning: 'R2 — Epic Pending quá tỉ lệ cho phép của chu trình TTM-CNTT (QLDA); nên quyết định tiếp tục hay huỷ. Không còn tính là "Sai lệch dữ liệu".',
    formula: 'status = Pending  VÀ  WD(T1, hoặc ngày tạo Jira nếu thiếu T1; asOf) ≥ 20% × N_CNTT',
    legacySource: 'evaluateEpicDataAnomaly R2',
  },
  {
    id: 'REC_FILL_START_DATE', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Bổ sung Start Date', precedence: 70, defaultEnabled: true,
    meaning: 'Bổ sung Start Date (T1) trên Jira.',
    formula: 'Có "Thiếu Start Date"  HOẶC  TTM-CNTT (QLDA) "Không tính được" do thiếu T1 (status ≥ DESIGN, không Cancelled)',
  },
  {
    id: 'REC_FIX_DATE_ORDER', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Sửa thứ tự ngày', precedence: 71, defaultEnabled: true,
    meaning: 'Kiểm tra lại các mốc ngày trên Jira.',
    formula: 'Có "Sai thứ tự ngày"  HOẶC  "Không tính được" do R4G phi logic',
  },
  {
    id: 'REC_FILL_REQUEST_TYPE', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Bổ sung Phân loại yêu cầu', precedence: 72, defaultEnabled: true,
    meaning: 'Bổ sung trường Phân loại yêu cầu.',
    formula: 'Có "Thiếu Phân loại yêu cầu"',
  },
  {
    id: 'REC_FILL_REQUIREMENT_LEVEL', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Bổ sung Requirement Level', precedence: 73, defaultEnabled: true,
    meaning: 'Bổ sung trường Requirement Level.',
    formula: 'Có "Thiếu Requirement Level"',
  },
  {
    id: 'REC_REVIEW_SP_LEVEL', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Rà soát loại yêu cầu', precedence: 74, defaultEnabled: true,
    meaning: 'Rà soát lại Phân loại yêu cầu / Requirement Level.',
    formula: 'Có "SP nhưng Level thấp"',
  },
  {
    id: 'REC_FIX_R4G_STATUS', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Cập nhật status / R4G Date', precedence: 75, defaultEnabled: true,
    meaning: 'Chuyển status Epic sang R4GOLIVE, hoặc kiểm tra lại R4G Date nếu ghi nhầm.',
    formula: 'Có "Có R4G Date nhưng chưa R4GOLIVE"',
  },
  {
    id: 'REC_FILL_R4G_DATE', axis: 'DATA_QUALITY', group: 'RECOMMENDATION', label: 'Bổ sung R4G Date', precedence: 76, defaultEnabled: true,
    meaning: 'Bổ sung R4G Date trên Jira.',
    formula: 'Có "Thiếu R4G Date"',
  },

  // ---------- SCOPE ----------
  {
    id: 'SCOPE_CNTT_OUT', axis: 'SCOPE', group: 'NOTE', label: 'Ngoài phạm vi TTM-CNTT (QLDA)', precedence: 10, defaultEnabled: true,
    meaning: 'Epic nằm ngoài khoảng ngày "R4G for TTM (CNTT)"; badge TTM-CNTT (QLDA) bị che, không tính vào chỉ số TTM-CNTT (QLDA).',
    formula: 'Có cấu hình A/B  VÀ  NOT( A ≤ (R4G, nếu trống thì Target_CNTT) ≤ B )',
    legacySource: 'computeTtmCnttInScope',
  },
  {
    id: 'SCOPE_QA_OUT', axis: 'SCOPE', group: 'NOTE', label: 'Ngoài phạm vi QA', precedence: 20, defaultEnabled: true,
    meaning: 'Epic nằm ngoài khoảng ngày "R4G for TTM (QA)"; không tính vào chỉ số TTM-CNTT (QA).',
    formula: 'Có cấu hình C/D  VÀ  NOT( C ≤ R4G ≤ D )  (R4G trống → ngoài phạm vi)',
    legacySource: 'computeQaInScope',
  },

  // ---------- PHASE (mỗi finding gắn 1 pha qua `subject`: DESIGN/DEV/TEST/PENTEST/R4GOLIVE) ----------
  {
    id: 'PHASE_LATE', axis: 'PHASE', group: 'ALERT', label: 'Trễ pha', precedence: 10, defaultEnabled: true,
    meaning: 'Pha chưa hoàn thành tại asOf và đã qua baseline của pha.',
    formula: 'Pha chưa xong tại asOf  VÀ  asOf > Baseline_pha.   Baseline_pha: DESIGN 20% → DEV 50% → TEST 80% → PENTEST 90% → R4GOLIVE = Target_CNTT',
    legacySource: 'computePhaseAlertLevel → LATE',
  },
  {
    id: 'REC_ACCELERATE_PHASE', axis: 'PHASE', group: 'RECOMMENDATION', label: 'Đẩy nhanh pha', precedence: 20, defaultEnabled: true,
    meaning: 'Đẩy nhanh pha hiện tại đang trễ.',
    formula: 'Có "Trễ pha" ở đúng pha hiện tại',
  },
  {
    id: 'PHASE_DONE', axis: 'PHASE', group: 'NOTE', label: 'Hoàn thành pha', precedence: 30, defaultEnabled: true,
    meaning: 'Pha đã hoàn thành tại asOf (theo status story/subtask tại asOf).',
    formula: 'DESIGN: status Epic = In Progress hoặc mọi subtask BA Done. DEV: mọi story ≥ READY FOR TEST. TEST: mọi story ≥ UAT DONE. R4GOLIVE: status = R4GOLIVE hoặc có R4G hoặc mọi story ≥ READY FOR GOLIVE. PENTEST: chưa có rule.',
    legacySource: 'computeEpicPhaseCompletionByEpicKey',
  },
  {
    id: 'PHASE_CURRENT', axis: 'PHASE', group: 'NOTE', label: 'Pha hiện tại', precedence: 40, defaultEnabled: true,
    meaning: 'Pha Epic đang thực hiện.',
    formula: 'DESIGN nếu status = DESIGN; R4GOLIVE nếu status ≥ R4GOLIVE; còn lại là pha đầu tiên chưa xong trong DEV → TEST → PENTEST',
    legacySource: 'resolveCurrentStage',
  },
  {
    id: 'PHASE_NOT_COMPUTABLE', axis: 'PHASE', group: 'NOTE', label: 'Không tính được', precedence: 50, defaultEnabled: true, core: true,
    meaning: 'Không tính được baseline pha.',
    formula: 'T1 trống  HOẶC  không có ngân sách N_CNTT',
    legacySource: 'naPhaseCell',
  },
  {
    id: 'PHASE_COMPLETION_UNAVAILABLE', axis: 'PHASE', group: 'NOTE', label: 'Thiếu dữ liệu hoàn thành', precedence: 60, defaultEnabled: true, core: true,
    meaning: 'Không có dữ liệu story/subtask tại asOf (quá thời hạn lưu trữ) — không xác định được pha đã xong hay chưa.',
    formula: 'Không có dữ liệu hoàn thành pha cho Epic tại asOf',
  },
] as const satisfies readonly BadgeDefinition[];

export type BadgeId = (typeof BADGES)[number]['id'];

/** Widened view for UI code that reads optional fields (legacySource, core). */
export const BADGE_LIST: readonly BadgeDefinition[] = BADGES;

export const BADGE_BY_ID: ReadonlyMap<BadgeId, BadgeDefinition> = new Map(BADGES.map((badge) => [badge.id, badge]));

/** Resolver: while `when` is active, each badge in `suppress` is still returned but marked suppressed. */
export const SUPPRESSIONS: readonly { when: BadgeId; suppress: readonly BadgeId[] }[] = [
  { when: 'CNTT_NOT_APPLICABLE', suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'] },
  { when: 'CNTT_CALC_BROKEN', suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH'] },
  { when: 'SCOPE_CNTT_OUT', suppress: ['CNTT_FAIL', 'CNTT_LATE', 'CNTT_PASS', 'CNTT_STATUS_MISMATCH', 'RELEASE_WAITING_GOLIVE'] },
  { when: 'E2E_CALC_BROKEN', suppress: ['E2E_FAIL', 'E2E_PASS', 'E2E_STATUS_MISMATCH'] },
];

/** TTM-CNTT (QLDA) / TTM-CNTT (QA) membership — not badges; aggregates only count these flags. */
export const INDEX_MEMBERSHIP_RULES: { index: 'TTM-CNTT (QLDA)' | 'TTM-CNTT (QA)' | 'TTM-E2E'; flag: string; formula: string }[] = [
  { index: 'TTM-CNTT (QLDA)', flag: 'Tính (counted)', formula: 'không Cancelled  VÀ  không "Ngoài phạm vi TTM-CNTT (QLDA)"' },
  { index: 'TTM-CNTT (QLDA)', flag: 'Epic hoàn thành — L04a (eligible)', formula: 'counted  VÀ  có R4G (kể cả ngày tương lai)  VÀ  không Sai lệch dữ liệu' },
  { index: 'TTM-CNTT (QLDA)', flag: 'Đạt — L05aa (pass)', formula: 'eligible  VÀ  có badge "Đạt TTM-CNTT (QLDA)" (R4G chưa tới ngày: chưa kết luận — L05ac, không vào mẫu số)' },
  { index: 'TTM-CNTT (QLDA)', flag: 'Fail — L05ab + L05ba', formula: 'counted  VÀ  có "Fail TTM-CNTT (QLDA)": có R4G muộn hơn Target (L05ab) hoặc chưa có R4G mà đã quá Target (L05ba). Epic Sai lệch dữ liệu không được chấm Fail' },
  { index: 'TTM-CNTT (QLDA)', flag: 'Mẫu số', formula: 'Đạt + Fail = L05aa + L05ab + L05ba (từ 04/10/2026)' },
  { index: 'TTM-CNTT (QA)', flag: 'Tính / Đạt / Fail / Mẫu số', formula: 'Như TTM-CNTT (QLDA), chỉ lấy Epic status ∈ {MVP DONE, RELEASED} và thay "Ngoài phạm vi TTM-CNTT (QLDA)" bằng "Ngoài phạm vi QA"' },
  { index: 'TTM-E2E', flag: 'Mẫu số / Đạt / Fail', formula: 'Mẫu số: không Cancelled, có R4G, không Sai lệch dữ liệu, không "Không tính được".  Đạt: có badge "Đạt TTM-E2E".  Fail: có "Fail TTM-E2E"' },
];

export const INDEX_PERCENT_FORMULA = 'TTM-CNTT (QLDA) / TTM-CNTT (QA), từ 04/10/2026:  Tỷ lệ % Pass = L05aa / (L05aa + L05ab + L05ba) × 100;  Tỷ lệ % Fail = (L05ab + L05ba) / (L05aa + L05ab + L05ba) × 100;  chưa có Epic nào được kết luận (mẫu số = 0): 100.   TTM-E2E:  Đạt / Mẫu số × 100;  nếu Mẫu số = 0: (Tính − Fail) / Tính × 100;  không có Epic nào: 100.';

export function badgesOf(axis: ScoringAxis, group: FindingGroup): BadgeDefinition[] {
  return BADGE_LIST.filter((badge) => badge.axis === axis && badge.group === group).sort((a, b) => a.precedence - b.precedence);
}
