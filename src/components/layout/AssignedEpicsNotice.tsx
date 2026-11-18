'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  claimBottomRightSlot,
  enqueueAssignedTasksFloatMessage,
  FLOAT_MESSAGE_PRIORITY,
} from '@/lib/bottom-right-slot';

/**
 * Thông báo "My assigned tasks" (owner 2026-10-28, đồng bộ sang Float message 2026-11-18 — REQ-20261118-02):
 * "TASK: Bạn có {n} epic được giao task!", n = số Epic được giao cho user mà trạng thái "Giao việc"
 * chưa phải Done. Hiển thị 1 lần mỗi lượt đăng nhập (nhớ `loginKey` trong localStorage), sử dụng chung hàng đợi
 * Float message với thứ tự ưu tiên #2 (sau #1 Tạo cache, trước #3 nội dung cấu hình của SUPERADMIN), viền màu brown,
 * timeout = 10s và có nút đóng 'x'. Bấm vào thông báo sẽ mở màn hình Quản trị Epic với bộ lọc nhanh "My assigned epics".
 */

export const ASSIGNED_NOTICE_SECONDS = 10;
const SHOWN_LOGIN_KEY = 'ttm-assigned-epics-notice-login';

function readShownLogin(): string | null {
  try {
    return window.localStorage.getItem(SHOWN_LOGIN_KEY);
  } catch {
    return null;
  }
}

function rememberShownLogin(loginKey: string): void {
  try {
    window.localStorage.setItem(SHOWN_LOGIN_KEY, loginKey);
  } catch {
    // Storage blocked: the notice may show again on the next page load — acceptable.
  }
}

export function AssignedEpicsNotice() {
  const router = useRouter();

  React.useEffect(() => {
    const controller = new AbortController();
    const release = claimBottomRightSlot('assigned-epics-notice', FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS);
    void (async () => {
      try {
        const response = await fetch('/api/epic-marks/assigned-notice', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number; loginKey?: string };
        const loginKey = data.loginKey ?? '';
        if (controller.signal.aborted || !loginKey || readShownLogin() === loginKey) return;
        rememberShownLogin(loginKey);
        if (!data.count || data.count < 1) return;
        enqueueAssignedTasksFloatMessage({
          onClick: () => router.push('/epic-alerts-15?markFilter=MINE'),
          text: `TASK: Bạn có ${data.count} epic được giao task!`,
        });
      } catch {
        // A notice is optional: stay silent when it cannot be loaded.
      } finally {
        release();
      }
    })();
    return () => {
      controller.abort();
      release();
    };
  }, [router]);

  return null;
}
