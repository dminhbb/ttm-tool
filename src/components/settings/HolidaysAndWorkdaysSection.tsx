'use client';

import { useState } from 'react';
import { CopySimple } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { HolidaysPanel } from '@/components/settings/HolidaysPanel';
import { MakeupWorkdaysPanel } from '@/components/settings/MakeupWorkdaysPanel';

const MIN_YEAR = 2026;
const MAX_YEAR = 2035;
const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => {
  const year = MIN_YEAR + i;
  return { value: String(year), label: String(year) };
});

function defaultYear(): number {
  const current = new Date().getFullYear();
  return Math.min(Math.max(current, MIN_YEAR), MAX_YEAR);
}

/**
 * Combined "Quản lý ngày nghỉ/làm bù" screen — a year filter (2026–2035, default = current year)
 * that both the Holidays panel and the Makeup Workdays panel read their records from (each panel
 * refetches on `year` change), plus "Copy sang năm sau" which duplicates every record (holidays +
 * makeup workdays) from the selected year into year + 1, shifting each date field by exactly one
 * year — see master-data-service.ts's copyHolidayDataToNextYear.
 */
export function HolidaysAndWorkdaysSection() {
  const [year, setYear] = useState(defaultYear);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCopying, setIsCopying] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleCopyToNextYear = async () => {
    if (!confirm(`Copy toàn bộ Ngày nghỉ lễ và Ngày làm bù của năm ${year} sang năm ${year + 1}?`)) return;
    setIsCopying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/holidays/copy-to-next-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({ text: `Đã copy ${result.holidaysCopied} Ngày nghỉ lễ và ${result.workdaysCopied} Ngày làm bù sang năm ${result.targetYear}.`, type: 'success' });
      if (year + 1 <= MAX_YEAR) setYear(year + 1);
      setRefreshKey((current) => current + 1);
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-40">
          <Select label="Năm" options={YEAR_OPTIONS} value={String(year)} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
        <Button variant="outline" icon={<CopySimple className="w-4 h-4" weight="bold" />} onClick={handleCopyToNextYear} isLoading={isCopying}>
          Copy sang năm sau ({year} → {year + 1})
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'} title={message.type === 'success' ? 'Thành công' : 'Lỗi'}>
          {message.text}
        </Alert>
      )}

      <HolidaysPanel key={`holidays-${year}-${refreshKey}`} year={year} />
      <MakeupWorkdaysPanel key={`workdays-${year}-${refreshKey}`} year={year} />
    </div>
  );
}
