'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CaretRight, ChartBar, Lightning } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { EarlyStartReportScreen } from './EarlyStartReportScreen';
import { EpicReportScreen } from './EpicReportScreen';

/**
 * "Báo cáo Epic (beta 2)" (owner 2026-11-04) — two layers on one route, so the menu, the access matrix, the session
 * renewal and the visit counter keep treating it as the single screen /reports:
 *   /reports                  → the menu: 2 buttons, centered;
 *   /reports?view=epic        → "Báo cáo Epic" (the report as it was);
 *   /reports?view=early-start → "Báo cáo Epic start sớm".
 */
type ReportView = 'epic' | 'early-start';

const REPORT_BUTTONS: readonly { view: ReportView; icon: Icon; title: string; subtitle: string }[] = [
  {
    view: 'epic',
    icon: ChartBar,
    title: 'Báo cáo Epic',
    subtitle: 'Báo cáo chuyên sâu các thông tin Epic của từng dự án, có đối chiếu so sánh giữa các lớp dữ liệu snapshot trong quá khứ.',
  },
  {
    view: 'early-start',
    icon: Lightning,
    title: 'Báo cáo Epic start sớm',
    subtitle: 'Báo cáo đánh giá biến động chỉ số TTM nếu tính toán trên subtask start sớm nhất của các Story trong mỗi Epic. Nếu thời gian start sớm < Start Date, tỷ số TTM sẽ lấy theo thời gian start sớm.',
  },
];

function parseView(value: string | null): ReportView | null {
  return value === 'epic' || value === 'early-start' ? value : null;
}

function ReportsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const view = parseView(useSearchParams().get('view'));
  const open = (next: ReportView | null) => router.push(next ? `${pathname}?view=${next}` : pathname);

  if (view === 'epic') return <EpicReportScreen onBack={() => open(null)} />;
  if (view === 'early-start') return <EarlyStartReportScreen onBack={() => open(null)} />;

  return (
    <div className="flex min-h-[60vh] flex-col bg-fb-surface p-4 text-fb-text-primary md:p-6">
      <InfoBannerDisplay pathname="/reports" />
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
          {REPORT_BUTTONS.map(({ view: target, icon: ButtonIcon, title, subtitle }) => (
            <button
              key={target}
              type="button"
              onClick={() => open(target)}
              className="group flex h-full flex-col items-start gap-3 rounded-none border-2 border-fb-border bg-fb-surface p-6 text-left shadow-sm transition-colors hover:border-[var(--color-text-brand)] hover:bg-fb-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-brand)]"
            >
              <span className="grid size-10 place-items-center bg-[var(--color-text-brand)] text-white">
                <ButtonIcon className="size-5" weight="bold" />
              </span>
              <span className="flex w-full items-center justify-between gap-2 text-base font-bold text-fb-text-primary">
                {title}
                <CaretRight className="size-4 shrink-0 text-fb-text-secondary transition-transform group-hover:translate-x-0.5" weight="bold" />
              </span>
              <span className="text-xs leading-relaxed text-fb-text-secondary">{subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <React.Suspense fallback={null}>
      <ReportsHub />
    </React.Suspense>
  );
}
