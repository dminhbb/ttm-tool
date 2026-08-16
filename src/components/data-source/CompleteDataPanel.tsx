'use client';

import { useEffect, useState } from 'react';
import { ListMagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CompleteDataModal } from '@/components/data-source/CompleteDataModal';

function todayIsoDate(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function CompleteDataPanel() {
  const [epicCount, setEpicCount] = useState<number | null>(null);
  const [storyCount, setStoryCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(true);
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [showModal, setShowModal] = useState(false);

  const fetchCount = async () => {
    setIsLoadingCount(true);
    try {
      const res = await fetch('/api/data-source/complete-data?countOnly=true');
      if (res.ok) {
        const data = await res.json();
        setEpicCount(data.epicCount);
        setStoryCount(data.storyCount);
      }
    } finally {
      setIsLoadingCount(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchCount);
  }, []);

  const totalMissing = (epicCount ?? 0) + (storyCount ?? 0);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Hoàn thiện dữ liệu</CardTitle>
        </CardHeader>
        <CardBody className="gap-4">
          <p className="text-fb-text-secondary">
            Nhiều Epic bị thiếu phân cấp Epic → Story → Subtask: Epic Key hoặc Story Key được issue con tham chiếu nhưng chưa từng tồn tại trong hệ thống — thường do file export Jira bỏ sót Epic/Story cha. Tự sinh Epic trống (Summary = Epic Key, Status &quot;In Progress&quot;) và Story trống (Summary = Story Key) để khôi phục đầy đủ phân cấp cho Epic Browser.
          </p>

          <Input
            type="date"
            label="Start Date gán cho Epic trống"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            helperText="Mặc định là ngày hôm nay"
          />

          <div className="flex items-center justify-between gap-3 rounded-lg border border-fb-border bg-fb-surface-muted p-3">
            <span className="text-fb-text-secondary">
              {isLoadingCount ? 'Đang tải…' : (
                <>Thiếu: <strong className="text-fb-text-primary">{epicCount} Epic</strong>, <strong className="text-fb-text-primary">{storyCount} Story</strong></>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              icon={<ListMagnifyingGlass className="w-4 h-4" />}
              disabled={isLoadingCount || totalMissing === 0}
              onClick={() => setShowModal(true)}
            >
              Liệt kê dữ liệu thiếu
            </Button>
          </div>
        </CardBody>
      </Card>

      <CompleteDataModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        startDate={startDate}
        onCompleted={() => void fetchCount()}
      />
    </>
  );
}
