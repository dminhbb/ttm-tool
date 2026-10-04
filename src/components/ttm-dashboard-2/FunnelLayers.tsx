import React, { useId } from 'react';

/**
 * TTM Dashboard 2 funnel drawing: 3D cone slices ("layers"), optionally split side by side into
 * groups whose widths follow their counts (docs/ttm-dashboard-2-spec.md §3).
 */

/** Every label — layer counts, layer names and the callout notes of narrow groups — uses the page's
 * own typeface (Inter with its Vietnamese subset, see app/layout.tsx). A font the app doesn't load
 * (the previous 'Plus Jakarta Sans') falls back glyph by glyph on Vietnamese text. */
const FONT = 'inherit';

function fmt(value: number): string {
  return value.toLocaleString('vi-VN');
}

export interface Ellipse { cx: number; cy: number; rx: number; ry: number }

/** y of the ellipse's front (lower) rim at x. */
function frontY(e: Ellipse, x: number): number {
  const u = (x - e.cx) / e.rx;
  return e.cy + e.ry * Math.sqrt(Math.max(0, 1 - u * u));
}

/** Width share per group: proportional to its count, but a non-empty (or always-shown) group never
 * gets less than `minShare`, so a small group stays visible and clickable. */
export function splitShares(weights: number[], minShare: number): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights.map(() => 1 / weights.length);
  const visible = weights.filter((value) => value > 0).length;
  const floor = Math.min(minShare, 1 / Math.max(visible, 1));
  const raw = weights.map((value) => value / total);
  const lifted = raw.map((share) => share > 0 && share < floor);
  const liftedTotal = lifted.filter(Boolean).length * floor;
  const restTotal = raw.reduce((sum, share, index) => sum + (lifted[index] ? 0 : share), 0);
  return raw.map((share, index) => (lifted[index] ? floor : restTotal > 0 ? (share / restTotal) * (1 - liftedTotal) : 0));
}

export interface SplitSegment {
  key: string;
  count: number;
  /** Rendered even with count 0 (gets the minimum share) — e.g. the two halves of Layer 4. */
  alwaysShow?: boolean;
  fill: string;
  lidFill: string;
  main: string;
  sub: string;
  calloutColor: string;
  ariaLabel: string;
  active?: boolean;
  dimmed?: boolean;
  onActivate?: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

interface SplitLayerProps {
  top: Ellipse;
  bottom: Ellipse;
  segments: SplitSegment[];
  minShare?: number;
  fontMain: number;
  fontSub: number;
  /** Callout line: elbow / end x-offset from the layer's top rim edge. */
  calloutElbow: number;
  calloutEnd: number;
}

/** One funnel layer split into groups whose widths follow their counts. A group too narrow for its
 * text gets a callout (pointer line + label) beside the funnel instead. */
export function SplitLayer({ top, bottom, segments, minShare = 0.14, fontMain, fontSub, calloutElbow, calloutEnd }: SplitLayerProps) {
  const clipPrefix = `split-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const shown = segments.filter((segment) => segment.count > 0 || segment.alwaysShow);
  const shares = splitShares(shown.map((segment) => (segment.count > 0 ? segment.count : 1e-6)), minShare);
  const midY = (top.cy + bottom.cy) / 2;

  const starts = shares.map((_, index) => shares.slice(0, index).reduce((sum, share) => sum + share, 0));
  const geometry = shown.map((segment, index) => {
    const f0 = starts[index];
    const f1 = index === shown.length - 1 ? 1 : f0 + shares[index];
    const tx0 = top.cx - top.rx + 2 * top.rx * f0;
    const tx1 = top.cx - top.rx + 2 * top.rx * f1;
    const bx0 = bottom.cx - bottom.rx + 2 * bottom.rx * f0;
    const bx1 = bottom.cx - bottom.rx + 2 * bottom.rx * f1;
    const ty0 = frontY(top, tx0);
    const ty1 = frontY(top, tx1);
    const by0 = frontY(bottom, bx0);
    const by1 = frontY(bottom, bx1);
    const path = `M ${tx0} ${ty0} A ${top.rx} ${top.ry} 0 0 0 ${tx1} ${ty1} L ${bx1} ${by1} A ${bottom.rx} ${bottom.ry} 0 0 1 ${bx0} ${by0} Z`;
    const midX = (tx0 + tx1 + bx0 + bx1) / 4;
    const widthAtMid = ((tx1 - tx0) + (bx1 - bx0)) / 2;
    const textWidth = Math.max(segment.main.length * fontMain * 0.62, segment.sub.length * fontSub * 0.56);
    return { segment, tx0, tx1, ty1, bx1, by1, path, midX, inside: textWidth <= widthAtMid - 8 };
  });

  const sideIndex = { left: 0, right: 0 };
  const callouts = geometry.filter((item) => !item.inside).map((item) => {
    const side: 'left' | 'right' = item.midX < top.cx ? 'left' : 'right';
    const slot = sideIndex[side]++;
    const labelY = midY - 8 + slot * 36;
    const dir = side === 'right' ? 1 : -1;
    const rimX = side === 'right' ? top.cx + top.rx : top.cx - top.rx;
    return { ...item, side, labelY, elbowX: rimX + dir * calloutElbow, endX: rimX + dir * calloutEnd };
  });

  return (
    <g>
      <defs>
        {geometry.map((item, index) => (
          <clipPath key={item.segment.key} id={`${clipPrefix}-${index}`}>
            <rect x={item.tx0} y={top.cy - top.ry - 2} width={Math.max(0, item.tx1 - item.tx0)} height={top.ry * 2 + 4} />
          </clipPath>
        ))}
      </defs>

      {geometry.map((item, index) => {
        const { segment } = item;
        const interactive = Boolean(segment.onActivate);
        return (
          <g
            key={segment.key}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={segment.ariaLabel}
            aria-pressed={interactive ? Boolean(segment.active) : undefined}
            className={`outline-none transition-[opacity,filter] duration-200 ${interactive ? 'cursor-pointer' : 'cursor-context-menu'} ${
              segment.active ? 'brightness-110 drop-shadow-md' : segment.dimmed ? 'opacity-60 hover:opacity-100' : 'hover:brightness-105'
            } focus-visible:drop-shadow-[0_0_3px_#1463f7]`}
            onClick={segment.onActivate}
            onKeyDown={(event) => {
              if (!segment.onActivate || (event.key !== 'Enter' && event.key !== ' ')) return;
              event.preventDefault();
              segment.onActivate();
            }}
            onContextMenu={segment.onContextMenu}
          >
            <path d={item.path} fill={segment.fill} />
            <ellipse cx={top.cx} cy={top.cy} rx={top.rx} ry={top.ry} fill={segment.lidFill} clipPath={`url(#${clipPrefix}-${index})`} />
            {item.inside && (
              <>
                <text x={item.midX} y={midY + fontMain * 0.15} fill="#ffffff" fontSize={fontMain} fontWeight="800" textAnchor="middle" fontFamily={FONT}>
                  {segment.main}
                </text>
                <text x={item.midX} y={midY + fontMain * 0.15 + fontSub + 6} fill="#ffffffd9" fontSize={fontSub} fontWeight="500" textAnchor="middle" fontFamily={FONT}>
                  {segment.sub}
                </text>
              </>
            )}
          </g>
        );
      })}

      {/* Seams between groups */}
      {geometry.slice(0, -1).map((item) => (
        <line key={`seam-${item.segment.key}`} x1={item.tx1} y1={item.ty1} x2={item.bx1} y2={item.by1} stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 2" pointerEvents="none" />
      ))}

      {/* Callouts for groups too narrow for their text */}
      {callouts.map((item) => (
        <g key={`callout-${item.segment.key}`} className="cursor-context-menu" onContextMenu={item.segment.onContextMenu} onClick={item.segment.onActivate}>
          <path
            d={`M ${item.midX} ${midY} L ${item.elbowX} ${item.labelY} L ${item.endX} ${item.labelY}`}
            stroke={item.segment.calloutColor}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={item.midX} cy={midY} r="2.5" fill={item.segment.calloutColor} />
          <text x={item.endX + (item.side === 'right' ? 6 : -6)} y={item.labelY - 3} fill={item.segment.calloutColor} fontSize="13" fontWeight="800" textAnchor={item.side === 'right' ? 'start' : 'end'} fontFamily={FONT}>
            {item.segment.main}
          </text>
          <text x={item.endX + (item.side === 'right' ? 6 : -6)} y={item.labelY + 12} fill="#64748b" fontSize="11" fontWeight="500" textAnchor={item.side === 'right' ? 'start' : 'end'} fontFamily={FONT}>
            {item.segment.sub}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A plain (unsplit) funnel layer: cone body + lid + count + label. */
export function SolidLayer({ top, bottom, fill, lidFill, count, label, labelColor, fontMain, onContextMenu }: {
  top: Ellipse; bottom: Ellipse; fill: string; lidFill: string; count: number; label: string; labelColor: string; fontMain: number;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const midY = (top.cy + bottom.cy) / 2;
  return (
    <g className="cursor-context-menu transition-all duration-200 hover:brightness-105" onContextMenu={onContextMenu}>
      <path
        d={`M ${top.cx - top.rx} ${top.cy} A ${top.rx} ${top.ry} 0 0 0 ${top.cx + top.rx} ${top.cy} L ${bottom.cx + bottom.rx} ${bottom.cy} A ${bottom.rx} ${bottom.ry} 0 0 1 ${bottom.cx - bottom.rx} ${bottom.cy} Z`}
        fill={fill}
      />
      <ellipse cx={top.cx} cy={top.cy} rx={top.rx} ry={top.ry} fill={lidFill} />
      <text x={top.cx} y={midY + 4} fill="#ffffff" fontSize={fontMain} fontWeight="800" textAnchor="middle" fontFamily={FONT}>
        {fmt(count)}
      </text>
      <text x={top.cx} y={midY + 24} fill={labelColor} fontSize="12" fontWeight="400" textAnchor="middle" fontFamily={FONT}>
        {label}
      </text>
    </g>
  );
}
