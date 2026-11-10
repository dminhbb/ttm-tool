'use client';

import * as React from 'react';
import { Play, TrendUp } from '@phosphor-icons/react';
import { useTickerRotation } from '@/components/ui/useTickerRotation';
import { buildReferenceSentence, buildTrendSentences, trendHead, type TtmDashboardTrend } from '@/lib/ttm-dashboard-trend';

/**
 * "So với <ngày>" ticker under the widget row of TTM Dashboard 2 (owner 2026-11-03), on ONE line:
 *   icon · fixed "So với dd/mm/yyyy:" · the fixed Fail TTM-CNTT sentence (the number viewers look at first — red when the
 *   count went up, the normal text color otherwise) · the other sentences, one at a time. In the company view (the API sends
 *   weekRef / monthRef nowhere else) the rotation also holds "So với tuần trước / tháng trước (<ngày>): …".
 * Each rotating sentence grows up from below and is shown for 3 seconds. The icon is the play switch: click to stop on the
 * current sentence, click again to go on. With "reduce motion" set in the OS the sentences still change, without the
 * animation. The rotation itself is shared with the pinned-article ticker of "Bản tin" (useTickerRotation).
 */

function formatComputedAt(value: string): string {
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

const viDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** `onOpenNewFails`: open Quản trị Epic on the new Fail TTM-CNTT Epics — offered when the count went up. */
export function TrendTicker({ onOpenNewFails, trend }: { onOpenNewFails?: () => void; trend: TtmDashboardTrend }) {
  const allSentences = buildTrendSentences(trend.current, trend.previous);
  // buildTrendSentences always starts with the Fail TTM-CNTT sentence (a count, never left out): it stays fixed.
  const [fixedSentence, ...sentences] = allSentences;
  // Company view only (the API leaves weekRef / monthRef out elsewhere): "So với tuần trước (…): …", "So với tháng trước (…): …".
  const referenceSentences = [
    trend.weekRef ? buildReferenceSentence('tuần trước', trend.weekRef, trend.current) : null,
    trend.monthRef ? buildReferenceSentence('tháng trước', trend.monthRef, trend.current) : null,
  ].filter((sentence): sentence is string => sentence !== null);
  const head = trendHead(trend.comparedLayerDate).trim();
  // One rotation: the widget sentences, then (company view) the week / month comparisons.
  const rotation = [...sentences, ...referenceSentences];
  const { index, itemStyle, playing, togglePlaying } = useTickerRotation(rotation.length);

  if (!fixedSentence) return null;
  const sentence = rotation.length > 0 ? rotation[index % rotation.length] : null;
  const failUp = trend.current.failCntt > trend.previous.failCntt;

  return (
    <div
      aria-label={`${head} ${[...allSentences, ...referenceSentences].join(' ')}`}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-sm text-fb-text-primary"
      role="region"
      title={`Tính lúc ${formatComputedAt(trend.computedAt)} — dữ liệu ${viDate(trend.latestLayerDate)} so với ${viDate(trend.comparedLayerDate)}`}
    >
      <button
        aria-label={playing ? 'Dừng dòng thông tin so sánh' : 'Tiếp tục dòng thông tin so sánh'}
        aria-pressed={!playing}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--color-text-brand)] outline-none transition-colors hover:bg-fb-control focus-visible:ring-2 focus-visible:ring-fb-blue"
        onClick={togglePlaying}
        title={playing ? 'Bấm để dừng' : 'Bấm để chạy tiếp'}
        type="button"
      >
        {playing ? <TrendUp aria-hidden="true" className="size-4" weight="bold" /> : <Play aria-hidden="true" className="size-4" weight="fill" />}
      </button>
      <span className="shrink-0 whitespace-nowrap font-bold">{head}</span>
      {failUp && onOpenNewFails && (trend.newFailCount ?? 0) > 0 ? (
        // Up = red and clickable: the Epics that became Fail TTM-CNTT since the compared day (owner 2026-11-03).
        <button
          className="shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-left text-status-danger underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-fb-blue"
          onClick={onOpenNewFails}
          title={`Xem ${trend.newFailCount} Epic Fail TTM-CNTT mới phát sinh trong Quản trị Epic`}
          type="button"
        >
          {fixedSentence}
        </button>
      ) : (
        <span className={`shrink-0 whitespace-nowrap ${failUp ? 'text-status-danger' : ''}`}>{fixedSentence}</span>
      )}
      {sentence && (
        <span aria-hidden="true" className="relative block h-5 min-w-[12rem] flex-1 overflow-hidden">
          <span
            className="absolute inset-x-0 top-0 block origin-bottom truncate leading-5"
            key={index}
            style={itemStyle}
            title={sentence}
          >
            {sentence}
          </span>
        </span>
      )}
      {rotation.length > 1 && (
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-fb-text-placeholder">{(index % rotation.length) + 1}/{rotation.length}</span>
      )}
    </div>
  );
}
