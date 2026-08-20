"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ImportIssuesTab } from '@/components/data-source/ImportIssuesTab';
import { ImportComponentsTab } from '@/components/data-source/ImportComponentsTab';

type Tab = 'issues' | 'components';

export default function DataSourcePage() {
  const [tab, setTab] = useState<Tab>('issues');

  return (
    <>
      <nav className="ui-tabs" aria-label="Quản trị nguồn dữ liệu">
        <Button onClick={() => setTab('issues')} variant={tab === 'issues' ? 'primary' : 'outline'}>Import Issues</Button>
        <Button onClick={() => setTab('components')} variant={tab === 'components' ? 'primary' : 'outline'}>Import Components</Button>
      </nav>

      {tab === 'issues' && <ImportIssuesTab />}
      {tab === 'components' && <ImportComponentsTab />}
    </>
  );
}
