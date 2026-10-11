'use client';

import * as React from 'react';
import { BookmarkSimple, CaretDown, CheckSquare, Lightning } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { isLevel1IssueType, isLevel2IssueType } from '@/lib/issue-hierarchy';
import type { DataReviewChildrenResponse, DataReviewIssue } from '@/lib/data-review-types';

export interface EpicIssuesTreeProps {
  root: DataReviewIssue;
}

const KIND_ICON = {
  epic: { className: 'text-fb-accent', icon: Lightning },
  story: { className: 'text-status-success', icon: BookmarkSimple },
  subtask: { className: 'text-fb-blue', icon: CheckSquare },
};

function IssueTypeIcon({ issueType }: { issueType: string }) {
  const kind = isLevel1IssueType(issueType) ? 'epic' : isLevel2IssueType(issueType) ? 'story' : 'subtask';
  const { className, icon: Icon } = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={issueType}>
      <Icon className={cn('size-4 shrink-0', className)} weight="fill" />
      <span className="text-xs font-medium text-fb-text-secondary">{issueType || 'Issue'}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-xs text-fb-text-placeholder">-</span>;
  const isDone = ['done', 'released', 'resolved'].includes(status.trim().toLowerCase());
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap',
        isDone
          ? 'bg-status-success-soft text-status-success'
          : 'bg-status-warning-soft text-status-warning'
      )}
    >
      {status}
    </span>
  );
}

async function fetchChildren(parentId: number, level: 'stories' | 'subtasks'): Promise<DataReviewIssue[]> {
  try {
    const response = await fetch(`/api/epic-browser?parentId=${parentId}&level=${level}`);
    if (!response.ok) return [];
    const data = (await response.json()) as DataReviewChildrenResponse;
    return data.items || [];
  } catch (err) {
    console.error(`Failed to fetch ${level} for parent ${parentId}`, err);
    return [];
  }
}

/**
 * Hierarchical 4-column table component for "Issues in Epic":
 * Columns: Issue Type | Issue Key | Summary | Status
 * Indentation for Issue Key:
 * - Epic (Level 1): 0ch
 * - Story (Level 2): 3ch relative to Epic
 * - Subtask (Level 3): 6ch relative to Epic (3ch relative to Story)
 */
export function EpicIssuesTree({ root }: EpicIssuesTreeProps) {
  const [expandedEpic, setExpandedEpic] = React.useState<boolean>(true);
  const [expandedStories, setExpandedStories] = React.useState<Set<number>>(new Set());

  const [loadingMap, setLoadingMap] = React.useState<Record<number, boolean>>({});
  const [stories, setStories] = React.useState<DataReviewIssue[]>([]);
  const [subtasksMap, setSubtasksMap] = React.useState<Record<number, DataReviewIssue[]>>({});

  // Loading for the root's first Story fetch is derived ("this root's stories haven't arrived
  // yet") instead of being set synchronously inside the effect below.
  const [autoLoadedRootId, setAutoLoadedRootId] = React.useState<number | null>(null);
  const isRootLoading = Boolean(loadingMap[root.id]) || (root.hasChildren && autoLoadedRootId !== root.id);

  // Auto-expand root epic on mount
  React.useEffect(() => {
    let active = true;
    if (root.hasChildren) {
      fetchChildren(root.id, 'stories').then((items) => {
        if (!active) return;
        setStories(items);
        setAutoLoadedRootId(root.id);
      });
    }
    return () => {
      active = false;
    };
  }, [root.id, root.hasChildren]);

  const toggleEpicExpand = async () => {
    if (!expandedEpic && stories.length === 0 && root.hasChildren) {
      setLoadingMap((prev) => ({ ...prev, [root.id]: true }));
      const items = await fetchChildren(root.id, 'stories');
      setStories(items);
      setLoadingMap((prev) => ({ ...prev, [root.id]: false }));
    }
    setExpandedEpic(!expandedEpic);
  };

  const toggleStoryExpand = async (story: DataReviewIssue) => {
    const isCurrentlyExpanded = expandedStories.has(story.id);
    const nextSet = new Set(expandedStories);

    if (isCurrentlyExpanded) {
      nextSet.delete(story.id);
    } else {
      nextSet.add(story.id);
      if (!subtasksMap[story.id] && story.hasChildren) {
        setLoadingMap((prev) => ({ ...prev, [story.id]: true }));
        const items = await fetchChildren(story.id, 'subtasks');
        setSubtasksMap((prev) => ({ ...prev, [story.id]: items }));
        setLoadingMap((prev) => ({ ...prev, [story.id]: false }));
      }
    }
    setExpandedStories(nextSet);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-fb-border bg-fb-surface-muted/70 font-bold text-fb-text-secondary">
            <th className="px-3 py-2.5 w-40">Issue Type</th>
            <th className="px-3 py-2.5 w-52">Issue Key</th>
            <th className="px-3 py-2.5 min-w-[240px]">Summary</th>
            <th className="px-3 py-2.5 w-32">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-fb-border/70">
          {/* Level 1: Epic */}
          <tr className="bg-fb-surface-muted/50 hover:bg-fb-surface-muted/60 font-semibold">
            <td className="px-3 py-2">
              <IssueTypeIcon issueType={root.issueType} />
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1" style={{ paddingLeft: '0ch' }}>
                {root.hasChildren ? (
                  <button
                    type="button"
                    onClick={toggleEpicExpand}
                    className="p-0.5 rounded hover:bg-fb-control-hover text-fb-text-secondary"
                    title={expandedEpic ? 'Thu gọn' : 'Mở rộng'}
                  >
                    {isRootLoading ? (
                      <span className="block size-3 animate-spin rounded-full border-2 border-fb-blue border-t-transparent" />
                    ) : (
                      <CaretDown className={cn('size-3.5 transition-transform', !expandedEpic && '-rotate-90')} weight="bold" />
                    )}
                  </button>
                ) : (
                  <span className="size-4 inline-block" />
                )}
                <span className="font-bold text-fb-blue">{root.issueKey}</span>
              </div>
            </td>
            <td className="px-3 py-2 text-fb-text-primary font-medium" title={root.summary}>
              {root.summary}
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={root.status} />
            </td>
          </tr>

          {/* Expanded Stories / Direct Children */}
          {expandedEpic && (
            <>
              {isRootLoading && stories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-fb-text-placeholder">
                    Đang tải danh sách Stories…
                  </td>
                </tr>
              )}

              {!isRootLoading && stories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-fb-text-placeholder italic">
                    Epic này chưa có Story nào.
                  </td>
                </tr>
              )}

              {stories.map((story) => {
                const storyExpanded = expandedStories.has(story.id);
                const subtasks = subtasksMap[story.id] || [];

                return (
                  <React.Fragment key={`story-group-${story.id}`}>
                    {/* Level 2: Story (3ch indent) */}
                    <tr className="hover:bg-fb-surface-muted/50">
                      <td className="px-3 py-2">
                        <IssueTypeIcon issueType={story.issueType} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1" style={{ paddingLeft: '3ch' }}>
                          {story.hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleStoryExpand(story)}
                              className="p-0.5 rounded hover:bg-fb-control-hover text-fb-text-secondary"
                              title={storyExpanded ? 'Thu gọn' : 'Mở rộng'}
                            >
                              {loadingMap[story.id] ? (
                                <span className="block size-3 animate-spin rounded-full border-2 border-fb-blue border-t-transparent" />
                              ) : (
                                <CaretDown className={cn('size-3.5 transition-transform', !storyExpanded && '-rotate-90')} weight="bold" />
                              )}
                            </button>
                          ) : (
                            <span className="size-4 inline-block" />
                          )}
                          <span className="font-semibold text-fb-blue">{story.issueKey}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-fb-text-primary" title={story.summary}>
                        {story.summary}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={story.status} />
                      </td>
                    </tr>

                    {/* Level 3: Subtasks under Story (6ch indent) */}
                    {storyExpanded && (
                      <>
                        {loadingMap[story.id] && subtasks.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-fb-text-placeholder italic" style={{ paddingLeft: '9ch' }}>
                              Đang tải Subtasks…
                            </td>
                          </tr>
                        )}
                        {!loadingMap[story.id] && subtasks.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-fb-text-placeholder italic text-[11px]" style={{ paddingLeft: '9ch' }}>
                              Story này chưa có Subtask nào.
                            </td>
                          </tr>
                        )}
                        {subtasks.map((subtask) => (
                          <tr key={`subtask-${subtask.id}`} className="hover:bg-fb-surface-muted/40 text-fb-text-secondary">
                            <td className="px-3 py-1.5">
                              <IssueTypeIcon issueType={subtask.issueType} />
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1" style={{ paddingLeft: '6ch' }}>
                                <span className="size-4 inline-block" />
                                <span className="font-medium text-fb-text-secondary">{subtask.issueKey}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-fb-text-secondary" title={subtask.summary}>
                              {subtask.summary}
                            </td>
                            <td className="px-3 py-1.5">
                              <StatusBadge status={subtask.status} />
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
