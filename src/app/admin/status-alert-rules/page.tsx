import { StatusAlertRulesSettings } from '@/components/status-alert-rules/StatusAlertRulesSettings';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';

export default function StatusAlertRulesPage() {
  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/admin/status-alert-rules" />
      <StatusAlertRulesSettings />
    </div>
  );
}
