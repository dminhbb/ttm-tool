'use client';

import { HolidaysAndWorkdaysSection } from '@/components/settings/HolidaysAndWorkdaysSection';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';

export default function HolidaysAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/admin/holidays" />
      <HolidaysAndWorkdaysSection />
    </div>
  );
}
