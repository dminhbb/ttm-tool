import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { VisitCounterPanel } from '@/components/visit-counter/VisitCounterPanel';

export default function VisitStatsPage() {
  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/visit-stats" />
      <VisitCounterPanel hideTitle />
    </div>
  );
}
