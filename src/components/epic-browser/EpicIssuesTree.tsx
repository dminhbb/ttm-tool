'use client';

import * as React from 'react';
import { BookmarkSimple, CaretDown, CaretRight, CheckSquare, Lightning } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { isLevel1IssueType, isLevel2IssueType } from '@/lib/issue-hierarchy';
import type { DataReviewChildrenResponse, DataReviewIssue } from '@/lib/data-review-types';

export interface EpicIssuesTreeProps {
  root: DataReviewIssue;
}

type TreeLevel = 1 | 2 | 3;

const KIND_ICON = {
  epic: { className: 'text-violet-600 dark:text-violet-400', icon: Lightning },
  story: { className: 'text-emerald-600 dark:text-emerald-400', icon: BookmarkSimple },
  subtask: { className: 'text-sky-600 dark:text-sky-400', icon: CheckSquare },
};

function IssueTypeIcon({ issueType }: { issueType: string }) {
  const kind = isLevel1IssueType(issueType) ? 'epic' : isLevel2IssueType(issueType) ? 'story' : 'subtask';
  const { className, icon: Icon } = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={issueType}>
      <Icon className={cn('size-4 shrink-0', className)} weight="fill" />
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{issueType || 'Issue'}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="text-xs text-slate-400">-</span>;
  const isDone = ['done', 'released', 'resolved'].includes(status.trim().toLowerCase());
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap',
        isDone
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
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

  // Auto-expand root epic on mount
  React.useEffect(() => {
    let active = true;
    if (root.hasChildren) {
      setLoadingMap((prev) => ({ ...prev, [root.id]: true }));
      fetchChildren(root.id, 'stories').then((items) => {
        if (!active) return;
        setStories(items);
        setLoadingMap((prev) => ({ ...prev, [root.id]: false }));
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
          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/70 font-bold text-slate-600 dark:text-slate-300">
            <th className="px-3 py-2.5 w-40">Issue Type</th>
            <th className="px-3 py-2.5 w-52">Issue Key</th>
            <th className="px-3 py-2.5 min-w-[240px]">Summary</th>
            <th className="px-3 py-2.5 w-32">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
          {/* Level 1: Epic */}
          <tr className="bg-slate-50/50 dark:bg-slate-900/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 font-semibold">
            <td className="px-3 py-2">
              <IssueTypeIcon issueType={root.issueType} />
            </td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-1" style={{ paddingLeft: '0ch' }}>
                {root.hasChildren ? (
                  <button
                    type="button"
                    onClick={toggleEpicExpand}
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                    title={expandedEpic ? 'Thu gọn' : 'Mở rộng'}
                  >
                    {loadingMap[root.id] ? (
                      <span className="block size-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    ) : (
                      <CaretDown className={cn('size-3.5 transition-transform', !expandedEpic && '-rotate-90')} weight="bold" />
                    )}
                  </button>
                ) : (
                  <span className="size-4 inline-block" />
                )}
                <span className="font-bold text-blue-600 dark:text-blue-400">{root.issueKey}</span>
              </div>
            </td>
            <td className="px-3 py-2 text-slate-900 dark:text-slate-100 font-medium" title={root.summary}>
              {root.summary}
            </td>
            <td className="px-3 py-2">
              <StatusBadge status={root.status} />
            </td>
          </tr>

          {/* Expanded Stories / Direct Children */}
          {expandedEpic && (
            <>
              {loadingMap[root.id] && stories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-slate-500">
                    Đang tải danh sách Stories…
                  </td>
                </tr>
              )}

              {!loadingMap[root.id] && stories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-center text-slate-400 italic">
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
                    <tr className="hover:bg-slate-100/50 dark:hover:bg-slate-800/30">
                      <td className="px-3 py-2">
                        <IssueTypeIcon issueType={story.issueType} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1" style={{ paddingLeft: '3ch' }}>
                          {story.hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleStoryExpand(story)}
                              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                              title={storyExpanded ? 'Thu gọn' : 'Mở rộng'}
                            >
                              {loadingMap[story.id] ? (
                                <span className="block size-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                              ) : (
                                <CaretDown className={cn('size-3.5 transition-transform', !storyExpanded && '-rotate-90')} weight="bold" />
                              )}
                            </button>
                          ) : (
                            <span className="size-4 inline-block" />
                          )}
                          <span className="font-semibold text-blue-600 dark:text-blue-400">{story.issueKey}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-200" title={story.summary}>
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
                            <td colSpan={4} className="px-3 py-2 text-slate-400 italic" style={{ paddingLeft: '9ch' }}>
                              Đang tải Subtasks…
                            </td>
                          </tr>
                        )}
                        {!loadingMap[story.id] && subtasks.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-slate-400 italic text-[11px]" style={{ paddingLeft: '9ch' }}>
                              Story này chưa có Subtask nào.
                            </td>
                          </tr>
                        )}
                        {subtasks.map((subtask) => (
                          <tr key={`subtask-${subtask.id}`} className="hover:bg-slate-100/40 dark:hover:bg-slate-800/20 text-slate-700 dark:text-slate-300">
                            <td className="px-3 py-1.5">
                              <IssueTypeIcon issueType={subtask.issueType} />
                            </td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1" style={{ paddingLeft: '6ch' }}>
                                <span className="size-4 inline-block" />
                                <span className="font-medium text-slate-700 dark:text-slate-300">{subtask.issueKey}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300" title={subtask.summary}>
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
