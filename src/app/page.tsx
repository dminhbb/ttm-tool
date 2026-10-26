"use client";

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { CacheStatusPanel } from '@/components/data-source/CacheStatusPanel';
import { ImportIssuesTab } from '@/components/data-source/ImportIssuesTab';
import { ComponentManagementTab } from '@/components/data-source/ComponentManagementTab';
import { DeniedImportTab } from '@/components/data-source/DeniedImportTab';
import { HistoryThinningTab } from '@/components/data-source/HistoryThinningTab';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { useCacheRebuildPending } from '@/lib/use-cache-rebuild-pending';

const TABS = ['issues', 'components', 'denied', 'history', 'cache'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null | undefined): value is Tab {
  return (TABS as readonly string[]).includes(value ?? '');
}

export default function DataSourcePage() {
  return (
    <Suspense fallback={null}>
      <DataSourceScreen />
    </Suspense>
  );
}

function DataSourceScreen() {
  // ?tab=cache — the "Nguồn dữ liệu" menu item opens "Theo dõi cache dữ liệu" while a rebuild is pending.
  const requested = useSearchParams()?.get('tab');
  const requestedTab = isTab(requested) ? requested : null;
  const [tab, setTab] = useState<Tab>(requestedTab ?? 'issues');
  const [lastRequestedTab, setLastRequestedTab] = useState<Tab | null>(requestedTab);
  if (requestedTab !== lastRequestedTab) {
    setLastRequestedTab(requestedTab);
    if (requestedTab) setTab(requestedTab);
  }
  // The page is SUPERADMIN-only (PAGE_ROLES '/'), so the rebuild status API is always allowed here.
  const cacheRebuildPending = useCacheRebuildPending(true);

  return (
    <>
      <InfoBannerDisplay pathname="/" />
      <nav className="ui-tabs" aria-label="Quản trị nguồn dữ liệu">
        <Button onClick={() => setTab('issues')} variant={tab === 'issues' ? 'primary' : 'outline'}>Import Issues</Button>
        <Button onClick={() => setTab('components')} variant={tab === 'components' ? 'primary' : 'outline'}>Quản lý Component</Button>
        <Button onClick={() => setTab('denied')} variant={tab === 'denied' ? 'primary' : 'outline'}>Từ chối import</Button>
        <Button onClick={() => setTab('history')} variant={tab === 'history' ? 'primary' : 'outline'}>Dọn lịch sử</Button>
        <Button
          variant={tab === 'cache' ? 'primary' : 'outline'}
          className="relative"
          onClick={() => setTab('cache')}
          title={cacheRebuildPending ? 'Cấu hình đã thay đổi sau lần tạo cache gần nhất — cần "Tạo lại cache"' : undefined}
        >
          Theo dõi cache dữ liệu
          {cacheRebuildPending && (
            <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-status-danger ring-2 ring-fb-surface" aria-label="Cần tạo lại cache" />
          )}
        </Button>
      </nav>

      {tab === 'issues' && <ImportIssuesTab />}
      {tab === 'components' && <ComponentManagementTab />}
      {tab === 'denied' && <DeniedImportTab />}
      {tab === 'history' && <HistoryThinningTab />}
      {tab === 'cache' && <CacheStatusPanel rebuildPending={cacheRebuildPending} />}
    </>
  );
}
