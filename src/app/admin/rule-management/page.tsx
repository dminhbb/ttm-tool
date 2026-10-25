'use client';

import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { RuleManagementSettings } from '@/components/rule-management/RuleManagementSettings';

export default function RuleManagementPage() {
  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/admin/rule-management" />
      <RuleManagementSettings />
    </div>
  );
}
