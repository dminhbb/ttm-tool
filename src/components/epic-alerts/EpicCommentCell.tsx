'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from '@phosphor-icons/react';
import { Tooltip } from '@/components/ui/Tooltip';
import type { EpicAlertRowPhased } from '@/lib/epic-alert-types';
import { useBadgeDesignStyle } from '@/lib/badge-design';
import {
  listEpicCommentBadges,
  summarizeEpicComments,
  GROUP_COLOR_CLASS,
  type CommentGroup,
  type CommentGroupKey,
} from '@/lib/epic-comment-groups';
import { isTtmCnttAchieved } from '@/lib/epic-row-verdicts';

/**
 * Xác định class màu của ô và panel (owner 2026-10-16):
 * - Ô Kết quả: nếu có kết quả fail -> nền màu orange, chữ trắng.
 * - Ô Sai lệch dữ liệu: nếu có giá trị (count > 0) -> nền màu orange, chữ trắng.
 * - Các trường hợp khác: dùng màu pastel chuẩn theo nhóm.
 */
function getGroupColorClass(group: CommentGroup): string {
  if (group.key === 'RESULT' && group.items.some((item) => item.tone === 'danger')) {
    return 'ttm-comment-cell-orange';
  }
  if (group.key === 'DATA_ANOMALY' && group.items.length > 0) {
    return 'ttm-comment-cell-orange';
  }
  return GROUP_COLOR_CLASS[group.key];
}

function CommentStripCell({
  group,
  isOpen,
  onClick,
  onMouseEnter,
}: {
  group: CommentGroup;
  isOpen: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const count = group.items.length;
  const isEmpty = count === 0;
  const colorClass = getGroupColorClass(group);

  if (isEmpty) {
    return (
      <Tooltip className="flex-1" content={`${group.label}: không có`} side="top">
        <div
          aria-label={`${group.label}: không có`}
          className={`ttm-comment-cell-empty ${colorClass}`}
        >
          -
        </div>
      </Tooltip>
    );
  }

  return (
    <button
      aria-controls={`epic-comment-${group.key}`}
      aria-expanded={isOpen}
      aria-label={`${group.label}, ${count} mục`}
      className={`ttm-comment-cell-btn flex-1 ${colorClass} ${isOpen ? 'ring-1 ring-inset ring-black/20 font-bold' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      type="button"
    >
      {count}
    </button>
  );
}

function CommentExpandedPanel({
  group,
  onClose,
}: {
  group: CommentGroup;
  onClose: () => void;
}) {
  const colorClass = getGroupColorClass(group);

  return (
    <div
      className={`ttm-comment-expanded-panel whitespace-normal break-words ${colorClass}`}
      id={`epic-comment-${group.key}`}
    >
      <div className="mb-1 flex items-center justify-between border-b border-black/10 pb-1 text-xs font-semibold">
        <span>{group.label} ({group.items.length})</span>
        <button
          aria-label="Đóng chi tiết"
          className="cursor-pointer text-xs font-bold opacity-60 hover:opacity-100 px-1 leading-none border-0 bg-transparent"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {group.items.map((item) => (
          <li className="border-t border-black/10 pt-1 text-xs leading-snug first:border-t-0 first:pt-0" key={item.key}>
            <strong className="block font-semibold opacity-95">{item.label}</strong>
            <span className="mt-0.5 block whitespace-normal break-words text-[11px] opacity-80">{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MinimalEpicCommentCell({ row }: { row: EpicAlertRowPhased }) {
  const { groups } = summarizeEpicComments(row);
  const [openKey, setOpenKey] = useState<CommentGroupKey | null>(null);

  // Khi di chuột qua ô có dữ liệu thì mở panel; khi rời chuột khỏi ô thì KHÔNG đóng để user có thể đọc lại
  const handleCellMouseEnter = (key: CommentGroupKey, count: number) => {
    if (count > 0) {
      setOpenKey(key);
    }
  };

  const handleCellClick = (key: CommentGroupKey, count: number) => {
    if (count === 0) return;
    setOpenKey((current) => (current === key ? null : key));
  };

  const handleClosePanel = () => {
    setOpenKey(null);
  };

  const openGroup = groups.find((group) => group.key === openKey && group.items.length > 0) ?? null;

  return (
    <div
      className="flex w-full min-w-[136px] max-w-[152px] flex-col items-start gap-1 whitespace-normal text-left"
      data-badge-design="minimal"
    >
      <div className="ttm-comment-strip">
        {groups.map((group) => (
          <CommentStripCell
            group={group}
            isOpen={openKey === group.key}
            key={group.key}
            onClick={() => handleCellClick(group.key, group.items.length)}
            onMouseEnter={() => handleCellMouseEnter(group.key, group.items.length)}
          />
        ))}
      </div>
      {openGroup && (
        <CommentExpandedPanel
          group={openGroup}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

function ListEpicCommentCell({ row }: { row: EpicAlertRowPhased }) {
  const badges = listEpicCommentBadges(row);

  if (badges.length === 0) {
    return <span className="ttm-empty-warning">—</span>;
  }

  return (
    <div className="ttm-comment-badge-list" data-badge-design="list">
      {badges.map((badge) => (
        <Tooltip
          className="inline-flex w-auto max-w-full"
          content={badge.message}
          key={badge.key}
          side="top"
        >
          <span className={`ttm-comment-badge ${badge.colorClass}`}>
            {badge.label}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

export function EpicCommentCell({ row }: { row: EpicAlertRowPhased }) {
  const badgeDesign = useBadgeDesignStyle();
  if (badgeDesign === 'minimal') {
    return <MinimalEpicCommentCell row={row} />;
  }
  return <ListEpicCommentCell row={row} />;
}

/**
 * Dedicated PASS column cell (owner request 2026-10-16):
 * - Fail TTM-CNTT: XCircle icon, orange color
 * - Pass TTM-CNTT: CheckCircle icon, green color
 * - Empty / not evaluated: renders null (empty cell)
 * - No text, icon only
 */
export function TtmCnttPassCell({ row }: { row: EpicAlertRowPhased }) {
  // Bỏ trống nếu Epic chưa có đánh giá pass/fail chỉ số TTM-CNTT:
  // ngoài phạm vi, thiếu Start Date (T1), hoặc trong danh sách loại trừ
  if (!row.ttmCnttInScope || !row.t1StartDate || row.ttmBlackListed || row.ttmExclusion) {
    return null;
  }

  // Fail TTM-CNTT: icon fail màu orange
  if (row.alertLevel === 'FAIL') {
    return (
      <Tooltip className="inline-flex w-auto" content="Fail TTM-CNTT (QLDA)">
        <span className="inline-flex items-center justify-center">
          <XCircle aria-label="Fail TTM-CNTT (QLDA)" className="size-5 ttm-icon-fail-orange" weight="fill" />
        </span>
      </Tooltip>
    );
  }

  // Pass TTM-CNTT: icon pass màu green
  if (isTtmCnttAchieved(row)) {
    return (
      <Tooltip className="inline-flex w-auto" content="Đạt TTM-CNTT (QLDA)">
        <span className="inline-flex items-center justify-center">
          <CheckCircle aria-label="Đạt TTM-CNTT (QLDA)" className="size-5 text-status-success" weight="fill" />
        </span>
      </Tooltip>
    );
  }

  // Chưa có kết luận Đạt/Fail (ví dụ đang triển khai, chưa quá hạn): để trống
  return null;
}
