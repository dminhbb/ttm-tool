'use client';

import type { CalculatorPhaseRow } from '@/lib/ttm-calculator';
import { phaseDisplayLabel } from '@/lib/ttm-calculator';
import { buildTimelineDays } from '@/lib/ttm-timeline';

/** Id duy nhất cho marker mũi tên (chỉ có một timeline trên trang). */
const ARROW_MARKER_ID = 'ttm-phase-arrow';

/**
 * Timeline SVG các Pha của TTM Calculator (REQ-20261119-02, chỉnh giao diện REQ-20261120-04), vẽ bằng SVG thuần
 * (không cần thư viện chart):
 * - Thanh timeline dày 30px, mỗi pha (DESIGN/DEV/TEST/PENTEST/R4G/Golive) một đoạn màu khác nhau (hệ pastel).
 * - Vạch kẻ nhạt phân tách từng ngày; ngày Thứ 7 / Chủ nhật / ngày Lễ (theo cấu hình) tô xám + ký tự '-'.
 * - Ngày làm bù (makeup workday) hiển thị như ngày làm việc bình thường (đúng logic addWorkingDays).
 * - Dòng Thứ + ngày phía trên: ngày nghỉ nền light grey + chữ đen; hôm nay nền vàng + chữ đỏ; thêm đường kẻ dọc
 *   2px đánh dấu ngày hôm nay trên thanh.
 * - Bên dưới: badge từng pha (tên đậm + ngày bắt đầu/kết thúc) + line & mũi tên trỏ lên ngày tương ứng; R4G (pha
 *   điểm) badge vừa khớp content, các pha thường badge bao đủ content, tối đa BADGE_HALF.
 */

/** Mỗi ngày một cột trên trục ngang. */
const DAY_W = 34;
const PAD_LEFT = 10;
const TIMELINE_Y = 30; // để 24px phía trên cho chữ Thứ + ngày (trên thanh)
const TIMELINE_H = 30;
const BADGE_TOP = TIMELINE_Y + TIMELINE_H + 18;
const BADGE_H = 26; // 20 × 1.3 — badge cao hơn 30% theo yêu cầu
const BADGE_MAX_W = 150;
/** Vị trí ngang của badge so với tâm pha (nửa chiều rộng). */
const BADGE_HALF = BADGE_MAX_W / 2;

/** Màu pastel của từng pha trên thanh timeline (hệ pastel để không quá chói, dễ nhìn trên nền trắng). */
const PHASE_COLORS: Record<CalculatorPhaseRow['key'], string> = {
  DESIGN: '#bae6fd', // sky-200
  DEV: '#bbf7d0', // green-200
  TEST: '#fef08a', // yellow-200
  PENTEST: '#fed7aa', // orange-200
  R4GOLIVE: '#bfdbfe', // blue-200
  GOLIVE: '#ddd6fe', // violet-200
};

/** Chữ đen trên nền pastel (badge) và nền light grey (label ngày nghỉ) — đọc rõ trên nền sáng. */
const BADGE_TEXT = '#000000';

const NON_WORKING_FILL = '#e2e8f0'; // slate-200 — nền ô ngày nghỉ trên thanh + nền label ngày nghỉ (light grey)
const DAY_LINE = '#e9edf3';
const TICK_TEXT = '#64748b'; // slate-500 — label ngày thường
const TODAY_FILL = '#fef08a'; // yellow-200 — nền vàng label ngày hôm nay
const TODAY_TEXT = '#dc2626'; // red-600 — chữ đỏ label hôm nay + đường kẻ dọc đánh dấu hôm nay trên thanh

/** "11/11" — ngày + tháng cho badge. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/** Ước lượng bề rộng (px) một dòng text với cỡ chữ cho trước — dùng để canh badge vừa khớp content. */
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6;
}

interface PhaseLayout {
  key: CalculatorPhaseRow['key'];
  label: string;
  color: string;
  fromDate: string;
  toDate: string;
  /** Tâm x của ngày bắt đầu / kết thúc trên trục ngày. */
  xFrom: number;
  xTo: number;
}

export function TtmPhaseTimeline({
  rows,
  goliveDate,
  holidays,
  startDate,
  startIsNonWorkingDay,
  workdays,
}: {
  rows: CalculatorPhaseRow[];
  goliveDate: string | null;
  holidays: ReadonlySet<string>;
  startDate: string;
  startIsNonWorkingDay: boolean;
  workdays: ReadonlySet<string>;
}) {
  // Chỉ render khi mọi pha trong phạm vi có đủ fromDate/toDate.
  const phases: PhaseLayout[] = [];
  for (const row of rows) {
    if (!row.fromDate || !row.toDate) return null;
  }
  const lastDay = goliveDate ?? rows[rows.length - 1]?.toDate;
  if (!lastDay || lastDay < startDate) return null;

  const days = buildTimelineDays(startDate, lastDay, holidays, workdays);
  if (days.length === 0) return null;

  // Ngày hôm nay theo giờ địa phương của trình duyệt (YYYY-MM-DD) — cột trùng ngày này tô nền vàng + chữ đỏ.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const gridWidth = days.length * DAY_W;
  const width = gridWidth + PAD_LEFT * 2;
  const height = BADGE_TOP + BADGE_H + 6;

  const dayIndex = new Map<string, number>();
  days.forEach((day, index) => dayIndex.set(day.iso, index));
  const xOf = (iso: string): number => PAD_LEFT + (dayIndex.get(iso) ?? 0) * DAY_W + DAY_W / 2;

  // Layout từng pha: đoạn từ xFrom đến xTo (tâm 2 ngày đầu/cuối của pha).
  for (const row of rows) {
    const fromDate = row.fromDate!;
    const toDate = row.toDate!;
    phases.push({
      key: row.key,
      label: phaseDisplayLabel(row.key),
      color: PHASE_COLORS[row.key],
      fromDate,
      toDate,
      xFrom: xOf(fromDate),
      xTo: xOf(toDate),
    });
  }

  return (
    <div className="overflow-x-auto">
      {/* mx-auto + max-w-none: canh giữa timeline so với panel phải khi hẹp hơn; overflow-x-auto vẫn cuộn khi rộng hơn. */}
      <svg
        aria-label="Timeline các pha"
        className="mx-auto block max-w-none"
        height={height}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <defs>
          <marker
            id={ARROW_MARKER_ID}
            markerHeight={5}
            markerWidth={5}
            orient="auto"
            refX={2.5}
            refY={2.5}
            viewBox="0 0 5 5"
          >
            <path d="M0,0 L5,2.5 L0,5 z" fill={TICK_TEXT} />
          </marker>
        </defs>

        {/* Thanh timeline: nền trắng chạy suốt chiều dài — vẽ TRƯỚC để các ô ngày nghỉ xám phủ lên trên, không viền (border 0). */}
        <rect fill="#fff" height={TIMELINE_H} rx={2} width={gridWidth} x={PAD_LEFT} y={TIMELINE_Y} />

        {/* Nền từng ngày: ngày nghỉ tô xám phủ lên nền trắng + ký tự '-' ở giữa. */}
        {days.map((day, index) => {
          const cx = PAD_LEFT + index * DAY_W + DAY_W / 2;
          const isToday = day.iso === todayIso;
          const isNonWorking = day.isNonWorking;
          return (
            <g key={day.iso}>
              {isNonWorking && <rect fill={NON_WORKING_FILL} height={TIMELINE_H} width={DAY_W} x={PAD_LEFT + index * DAY_W} y={TIMELINE_Y} />}
              {/* Vạch kẻ phân tách ngày. */}
              <line stroke={DAY_LINE} strokeWidth={1} x1={PAD_LEFT + index * DAY_W} x2={PAD_LEFT + index * DAY_W} y1={TIMELINE_Y} y2={TIMELINE_Y + TIMELINE_H} />
              {isNonWorking && (
                <text fill={TICK_TEXT} fontSize={11} fontWeight={700} textAnchor="middle" x={cx} y={TIMELINE_Y + TIMELINE_H / 2 + 3}>
                  -
                </text>
              )}
              {/* Dòng Thứ + ngày phía trên thanh: ngày nghỉ (Thứ 7 / Chủ nhật / ngày Lễ theo cấu hình) nền light grey + chữ đen;
                  hôm nay nền vàng + chữ đỏ (vẽ nền trước, chữ phủ lên). */}
              {(isNonWorking || isToday) && <rect fill={isNonWorking ? NON_WORKING_FILL : TODAY_FILL} height={19} rx={3} width={DAY_W} x={PAD_LEFT + index * DAY_W} y={TIMELINE_Y - 19} />}
              <text fill={isToday ? TODAY_TEXT : isNonWorking ? BADGE_TEXT : TICK_TEXT} fontSize={isToday ? 10 : 9} fontWeight={isToday ? 800 : 400} textAnchor="middle" x={cx} y={TIMELINE_Y - 10}>
                {day.weekday}
              </text>
              <text fill={isToday ? TODAY_TEXT : isNonWorking ? BADGE_TEXT : TICK_TEXT} fontSize={isToday ? 10 : 9} fontWeight={isToday ? 800 : 400} textAnchor="middle" x={cx} y={TIMELINE_Y - 1}>
                {day.day}
              </text>
            </g>
          );
        })}

        {/* Các đoạn pha: không bo góc để các đoạn màu khít nhau, không viền. */}
        {phases.map((phase) => (
          <rect
            fill={phase.color}
            height={TIMELINE_H}
            key={phase.key}
            width={Math.max(phase.xTo - phase.xFrom + DAY_W, 4)}
            x={phase.xFrom - DAY_W / 2}
            y={TIMELINE_Y}
          />
        ))}

        {/* Đường kẻ dọc 2px đánh dấu ngày hôm nay trên thanh timeline — vẽ SAU các đoạn pha để luôn nổi trên thanh. */}
        {days.map((day, index) => (day.iso !== todayIso ? null : (
          <rect fill={TODAY_TEXT} height={TIMELINE_H} key="today-line" width={2} x={PAD_LEFT + index * DAY_W + DAY_W / 2 - 1} y={TIMELINE_Y} />
        )))}

        {/* Ghi chú start date rơi vào ngày nghỉ. */}
        {startIsNonWorkingDay && (
          <text fill={TICK_TEXT} fontSize={10} x={PAD_LEFT} y={TIMELINE_Y - 18}>
            Start date là ngày nghỉ — vẫn tính là ngày thứ nhất (như Epic thật).
          </text>
        )}

        {/* Badge từng pha bên dưới: tên đậm + ngày bắt đầu/kết thúc; mũi tên trỏ lên ngày tương ứng. */}
        {phases.map((phase) => {
          const isPoint = phase.fromDate === phase.toDate; // R4GOLIVE: 1 ngày
          const centerX = (phase.xFrom + phase.xTo) / 2;
          // Bề rộng content của badge (dòng chữ rộng nhất: tên pha 11px, ngày 10px) → canh badge vừa khớp content.
          const dateText = isPoint ? shortDate(phase.fromDate) : `${shortDate(phase.fromDate)} → ${shortDate(phase.toDate)}`;
          const contentHalf = Math.max(textWidth(phase.label, 11), textWidth(dateText, 10)) / 2;
          const phaseHalf = (phase.xTo - phase.xFrom) / 2;
          // Pha điểm (R4G): badge vừa đủ content (không dài hơn). Pha thường: badge ít nhất bao content, không quá BADGE_HALF.
          const half = isPoint ? Math.min(BADGE_HALF, contentHalf) : Math.min(BADGE_HALF, Math.max(phaseHalf, contentHalf));
          return (
            <g key={phase.key}>
              {/* Line + mũi tên trỏ lên ngày bắt đầu và ngày kết thúc trên thanh timeline. */}
              <line markerEnd={`url(#${ARROW_MARKER_ID})`} stroke={TICK_TEXT} strokeWidth={1.5} x1={phase.xFrom} x2={phase.xFrom} y1={BADGE_TOP - 2} y2={TIMELINE_Y + TIMELINE_H} />
              {!isPoint && <line markerEnd={`url(#${ARROW_MARKER_ID})`} stroke={TICK_TEXT} strokeWidth={1.5} x1={phase.xTo} x2={phase.xTo} y1={BADGE_TOP - 2} y2={TIMELINE_Y + TIMELINE_H} />}

              {/* Badge chứa tên pha (đậm) + ngày bắt đầu/kết thúc; không viền (border 0); chữ tối để đọc trên nền pastel. */}
              <rect fill={phase.color} height={BADGE_H} rx={4} width={half * 2} x={centerX - half} y={BADGE_TOP} />
              <text fill={BADGE_TEXT} fontSize={11} fontWeight={800} textAnchor="middle" x={centerX} y={BADGE_TOP + 10}>
                {phase.label}
              </text>
              <text fill={BADGE_TEXT} fontSize={10} fontWeight={700} textAnchor="middle" x={centerX} y={BADGE_TOP + 20}>
                {dateText}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-[11px] text-fb-text-secondary">
        Dải màu xám = ngày nghỉ (Thứ 7 / Chủ nhật / ngày Lễ theo cấu hình). Các ngày tính theo ngày làm việc của ứng dụng.
      </p>
    </div>
  );
}
