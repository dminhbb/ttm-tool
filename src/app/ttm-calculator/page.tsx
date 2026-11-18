import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { TtmCalculatorScreen } from '@/components/ttm-calculator/TtmCalculatorScreen';

export default function TtmCalculatorPage() {
  return (
    <div className="flex flex-col gap-4">
      <InfoBannerDisplay pathname="/ttm-calculator" />
      <TtmCalculatorScreen />
    </div>
  );
}
