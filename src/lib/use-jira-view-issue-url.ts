'use client';

import { useEffect, useState } from 'react';

/** Loads the "Địa chỉ Jira View Issue" configured in Quản lý chung → Cấu hình Jira, once per mount. Empty string until loaded or if unconfigured — callers should skip rendering a Jira link in that case. */
export function useJiraViewIssueUrl(): string {
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/jira-settings', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { viewIssueBaseUrl?: string } | null) => {
        if (!cancelled && data?.viewIssueBaseUrl) setBaseUrl(data.viewIssueBaseUrl);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return baseUrl;
}
