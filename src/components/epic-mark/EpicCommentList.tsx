import { formatCommentHead, type EpicCommentEntry } from '@/lib/epic-mark-format';

/** One comment per line: "{Ngày - Giờ} - {User}" in bold, then " : {Comment}". Newest first. */
export function EpicCommentList({ comments, emptyText = 'Chưa có comment.' }: { comments: readonly EpicCommentEntry[]; emptyText?: string }) {
  if (comments.length === 0) return <p className="m-0 text-xs text-fb-text-placeholder">{emptyText}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs leading-snug text-fb-text-primary">
      {comments.map((comment) => (
        <li className={comment.isSystem || comment.isDeleted ? 'italic text-fb-text-secondary' : undefined} key={comment.id}>
          <strong className="font-bold not-italic text-fb-text-primary">{formatCommentHead(comment)}</strong>
          <span> : {comment.content}</span>
        </li>
      ))}
    </ul>
  );
}
