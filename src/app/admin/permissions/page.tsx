import { PermissionMatrixSettings } from '@/components/permission-matrix/PermissionMatrixSettings';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';

export default function PermissionMatrixPage() {
  return (
    <div className="flex flex-col gap-6">
      <InfoBannerDisplay pathname="/admin/permissions" />
      <PermissionMatrixSettings />
    </div>
  );
}
