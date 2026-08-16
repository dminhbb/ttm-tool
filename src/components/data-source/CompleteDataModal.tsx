'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

interface OrphanEpicCandidate {
  epicKey: string;
  referencedCount: number;
}

interface OrphanStoryCandidate {
  epicKey: string;
  referencedCount: number;
  storyKey: string;
}

export interface CompleteDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
  startDate: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export function CompleteDataModal({ isOpen, onClose, onCompleted, startDate }: CompleteDataModalProps) {
  const [epics, setEpics] = useState<OrphanEpicCandidate[]>([]);
  const [stories, setStories] = useState<OrphanStoryCandidate[]>([]);
  const [selectedEpics, setSelectedEpics] = useState<Set<string>>(new Set());
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchCandidates = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/data-source/complete-data');
      if (res.ok) {
        const data: { epics: OrphanEpicCandidate[]; stories: OrphanStoryCandidate[] } = await res.json();
        setEpics(data.epics);
        setStories(data.stories);
        setSelectedEpics(new Set(data.epics.map((item) => item.epicKey)));
        setSelectedStories(new Set(data.stories.map((item) => item.storyKey)));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void Promise.resolve().then(fetchCandidates);
  }, [isOpen]);

  const toggleEpic = (epicKey: string) => {
    setSelectedEpics((current) => {
      const next = new Set(current);
      if (next.has(epicKey)) next.delete(epicKey); else next.add(epicKey);
      return next;
    });
  };

  const toggleStory = (storyKey: string) => {
    setSelectedStories((current) => {
      const next = new Set(current);
      if (next.has(storyKey)) next.delete(storyKey); else next.add(storyKey);
      return next;
    });
  };

  const totalSelected = selectedEpics.size + selectedStories.size;

  const handleComplete = async () => {
    if (totalSelected === 0) return;
    setIsCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/data-source/complete-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicKeys: [...selectedEpics], storyKeys: [...selectedStories], startDate }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({ text: result.error || 'Lỗi hệ thống.', type: 'error' });
        return;
      }
      setMessage({
        text: `Đã tạo ${result.createdEpics.length} Epic và ${result.createdStories.length} Story (Start Date ${formatDate(startDate)}).`,
        type: 'success',
      });
      await fetchCandidates();
      onCompleted();
    } catch {
      setMessage({ text: 'Không thể kết nối API.', type: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Dữ liệu thiếu (${epics.length} Epic, ${stories.length} Story)`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button isLoading={isCreating} disabled={totalSelected === 0} onClick={handleComplete}>
            Hoàn thiện dữ liệu ({totalSelected})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {message && <Alert title={message.type === 'success' ? 'Thành công' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : epics.length === 0 && stories.length === 0 ? (
          <EmptyState title="Dữ liệu đã đầy đủ" description="Không còn Epic hay Story nào bị thiếu." />
        ) : (
          <>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-fb-text-secondary">Epic thiếu ({epics.length})</p>
              {epics.length === 0 ? (
                <p className="text-fb-text-secondary">Không có Epic nào bị thiếu.</p>
              ) : (
                <ul className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-lg border border-fb-border p-2">
                  {epics.map((item) => (
                    <li key={item.epicKey}>
                      <label className="ui-check flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedEpics.has(item.epicKey)} onChange={() => toggleEpic(item.epicKey)} />
                          <span className="font-bold text-fb-blue">{item.epicKey}</span>
                        </span>
                        <span className="text-[10.5px] text-fb-text-secondary">{item.referencedCount} issue liên kết</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-fb-text-secondary">Story thiếu ({stories.length})</p>
              {stories.length === 0 ? (
                <p className="text-fb-text-secondary">Không có Story nào bị thiếu.</p>
              ) : (
                <ul className="flex max-h-[200px] flex-col gap-1 overflow-y-auto rounded-lg border border-fb-border p-2">
                  {stories.map((item) => (
                    <li key={item.storyKey}>
                      <label className="ui-check flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={selectedStories.has(item.storyKey)} onChange={() => toggleStory(item.storyKey)} />
                          <span className="font-bold text-fb-blue">{item.storyKey}</span>
                          <span className="text-[10.5px] text-fb-text-secondary">(Epic {item.epicKey})</span>
                        </span>
                        <span className="text-[10.5px] text-fb-text-secondary">{item.referencedCount} subtask liên kết</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
