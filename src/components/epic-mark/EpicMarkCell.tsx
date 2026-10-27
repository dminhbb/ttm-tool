'use client';

import { EyeSlash, FlagBanner } from '@phosphor-icons/react';
import { EpicCommentList } from '@/components/epic-mark/EpicCommentList';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';

/**
 * "Review" column (formerly "Mark") of Quản trị Epic: a solid flag when the Epic has comments (orange; green once "Giao việc" is Done;
 * hover = Giao việc + its 2 newest comments), plus an eye-slash
 * when the viewer hid it (Hide is personal). Clicking either opens the Review Notes popup. An Epic with neither shows a faint outline flag
 * that opens the same popup (the only way to write a first comment).
 */
export function EpicMarkCell({ onOpen, row }: { onOpen: (epicKey: string) => void; row: EpicAlertRowPhased }) {
  const mark = row.mark;
  if (!mark || (mark.commentCount === 0 && !mark.isHidden)) {
    // No comment yet: a faint outline flag is the way in to write the first one.
    return (
      <Tooltip className="inline-flex w-auto" content="Thêm Review Notes" side="top">
        <button aria-label={`Thêm Review Notes — ${row.epicKey}`} className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 opacity-25 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => onOpen(row.epicKey)} type="button">
          <FlagBanner className="size-5 text-fb-text-secondary" weight="regular" />
        </button>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex items-center justify-center gap-1">
      {mark.commentCount > 0 && (
        <Tooltip
          className="inline-flex w-auto"
          multiline
          content={(
            <div>
              <div className={`mb-1 text-[11px] font-bold ${mark.taskDone ? 'ttm-mark-flag-done' : 'ttm-mark-flag'}`}>Giao việc: {mark.taskDone ? 'Done' : 'To do'}</div>
              <EpicCommentList comments={mark.latestComments} />
              {mark.commentCount > mark.latestComments.length && (
                <div className="mt-1 text-[11px] opacity-70">… và {mark.commentCount - mark.latestComments.length} comment cũ hơn</div>
              )}
            </div>
          )}
          side="right"
        >
          <button aria-label={`Review Notes — ${row.epicKey}${mark.taskDone ? ' — Giao việc: Done' : ''}`} className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0" onClick={() => onOpen(row.epicKey)} type="button">
            {/* Orange = comment, Giao việc still To do; green = Giao việc Done (owner 2026-10-27). */}
            <FlagBanner className={`size-5 ${mark.taskDone ? 'ttm-mark-flag-done' : 'ttm-mark-flag'}`} weight="fill" />
          </button>
        </Tooltip>
      )}
      {mark.isHidden && (
        <Tooltip className="inline-flex w-auto" content="Bạn đã ẩn Epic này khỏi danh sách Quản trị Epic của bạn (người khác vẫn thấy)" multiline side="top">
          <button aria-label={`Epic đã ẩn — ${row.epicKey}`} className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0" onClick={() => onOpen(row.epicKey)} type="button">
            <EyeSlash className="size-5 text-fb-text-secondary" weight="bold" />
          </button>
        </Tooltip>
      )}
    </span>
  );
}
