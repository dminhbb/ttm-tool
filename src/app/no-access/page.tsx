import { Lock } from '@phosphor-icons/react/dist/ssr';

/** Landing spot when Ma trận phân quyền leaves a role no landing page it may view (see
 * fallbackPathFor in feature-access.ts) — never feature-gated itself, so it can't redirect-loop. */
export default function NoAccessPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Lock className="size-10 text-fb-text-secondary" weight="duotone" />
      <p className="text-base font-bold text-fb-text-primary">Bạn chưa được cấp quyền xem màn hình nào</p>
      <p className="max-w-md text-sm text-fb-text-secondary">
        Quyền &quot;Xem&quot; của vai trò bạn đang dùng đã bị tắt trong Ma trận phân quyền. Vui lòng liên hệ quản trị hệ thống để được cấp quyền.
      </p>
    </div>
  );
}
