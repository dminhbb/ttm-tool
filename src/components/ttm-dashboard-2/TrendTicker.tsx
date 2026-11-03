'use client';

import * as React from 'react';
import { Play, TrendUp } from '@phosphor-icons/react';
import { buildTrendSentences, trendHead, type TtmDashboardTrend } from '@/lib/ttm-dashboard-trend';

/**
 * "So với <ngày>" ticker under the widget row of TTM Dashboard 2 (owner 2026-11-03). The head "So với dd/mm/yyyy:" stays
 * fixed right of the icon, then the Fail TTM-CNTT sentence — the number viewers look at first — fixed too (owner
 * 2026-11-03); the other sentences follow one at a time, each growing up from below and shown for 3 seconds. The
 * icon is the play switch: click to stop on the current sentence, click again to go on. With "reduce motion" set in the
 * OS the sentences still change, without the animation.
 */

const SENTENCE_MS = 3000;
const GROW_MS = 400;

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
  const head = trendHead(trend.comparedLayerDate).trim();
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  // false for one frame after a sentence changes, so it starts below and grows up into place.
  const [grown, setGrown] = React.useState(true);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    if (!playing || sentences.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setGrown(false);
      setIndex((current) => (current + 1) % sentences.length);
    }, SENTENCE_MS);
    return () => window.clearInterval(timer);
  }, [playing, sentences.length]);

  React.useEffect(() => {
    if (grown) return undefined;
    const frame = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [grown, index]);

  if (!fixedSentence) return null;
  const sentence = sentences.length > 0 ? sentences[index % sentences.length] : null;

  return (
    <div
      aria-label={`${head} ${allSentences.join(' ')}`}
      className="flex min-w-0 items-center gap-2 py-1 text-sm text-fb-text-primary"
      role="region"
      title={`Tính lúc ${formatComputedAt(trend.computedAt)} — dữ liệu ${viDate(trend.latestLayerDate)} so với ${viDate(trend.comparedLayerDate)}`}
    >
      <button
        aria-label={playing ? 'Dừng dòng thông tin so sánh' : 'Tiếp tục dòng thông tin so sánh'}
        aria-pressed={!playing}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--color-text-brand)] outline-none transition-colors hover:bg-fb-control focus-visible:ring-2 focus-visible:ring-fb-blue"
        onClick={() => setPlaying((current) => !current)}
        title={playing ? 'Bấm để dừng' : 'Bấm để chạy tiếp'}
        type="button"
      >
        {playing ? <TrendUp aria-hidden="true" className="size-4" weight="bold" /> : <Play aria-hidden="true" className="size-4" weight="fill" />}
      </button>
      <span className="shrink-0 whitespace-nowrap font-bold">{head}</span>
      {trend.current.failCntt > trend.previous.failCntt && onOpenNewFails && (trend.newFailCount ?? 0) > 0 ? (
        // Up = brown and clickable: the Epics that became Fail TTM-CNTT since the compared day (owner 2026-11-03).
        <button
          className="ttm-trend-fail-up shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-left underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-fb-blue"
          onClick={onOpenNewFails}
          title={`Xem ${trend.newFailCount} Epic Fail TTM-CNTT mới phát sinh trong Quản trị Epic`}
          type="button"
        >
          {fixedSentence}
        </button>
      ) : (
        <span className="shrink-0 whitespace-nowrap">{fixedSentence}</span>
      )}
      {sentence && <span aria-hidden="true" className="relative block h-5 min-w-0 flex-1 overflow-hidden">
        <span
          className="absolute inset-x-0 top-0 block origin-bottom truncate leading-5"
          key={index}
          style={{
            opacity: grown ? 1 : 0,
            transform: grown ? 'translateY(0) scale(1)' : 'translateY(70%) scale(0.92)',
            transition: reducedMotion ? 'none' : `transform ${GROW_MS}ms ease-out, opacity ${GROW_MS}ms ease-out`,
          }}
          title={sentence}
        >
          {sentence}
        </span>
      </span>}
      {sentences.length > 1 && (
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-fb-text-placeholder">{(index % sentences.length) + 1}/{sentences.length}</span>
      )}
    </div>
  );
}
