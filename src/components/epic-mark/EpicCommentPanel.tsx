'use client';

import * as React from 'react';
import { EyeSlash } from '@phosphor-icons/react';
import { EpicCommentList } from '@/components/epic-mark/EpicCommentList';
import type { EpicCommentEntry } from '@/lib/epic-mark-format';

/**
 * Read-only "Comment" panel of the Duyệt Epic popup: the Epic's comments (newest first) and whether the viewer hid it.
 * Shows nothing for an Epic without comments that is not hidden, or when the viewer's data scope lacks the Epic.
 */
export function EpicCommentPanel({ epicKey }: { epicKey: string }) {
  const [state, setState] = React.useState<{ comments: EpicCommentEntry[]; isHidden: boolean } | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/epic-marks/${encodeURIComponent(epicKey)}`, { signal: controller.signal });
        if (!response.ok || controller.signal.aborted) return;
        const data = await response.json();
        setState({ comments: data.comments, isHidden: data.isHidden });
      } catch {
        // Comments are supplementary: no panel when they cannot be loaded.
      }
    })();
    return () => controller.abort();
  }, [epicKey]);

  if (!state || (state.comments.length === 0 && !state.isHidden)) return null;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fb-text-secondary">
        <span>Comment ({state.comments.length})</span>
        {state.isHidden && (
          <span className="inline-flex items-center gap-1 rounded bg-fb-surface-muted px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-fb-text-primary">
            <EyeSlash className="size-3.5" weight="bold" />Bạn đã ẩn khỏi Quản trị Epic của bạn
          </span>
        )}
      </div>
      <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-fb-border/80 bg-fb-surface-muted/50 p-4">
        <EpicCommentList comments={state.comments} />
      </div>
    </div>
  );
}
