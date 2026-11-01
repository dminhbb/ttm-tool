'use client';

import { MultiSelect } from '@/components/ui/MultiSelect';
import type { Project, ProjectComponent } from '@/lib/master-data-types';

/**
 * "Dự án" + "Giới hạn theo Component" of the user popup — ONE block shared by tab "Phân quyền" (PM/SM projects) and
 * tab "Quyền xem" (projects to view), so both look and behave the same (owner 2026-11-01). `projectComponents` maps a
 * project id (as text) to its chosen components; a project without an entry / with none = the whole project.
 */
export function ProjectComponentFields({ allProjectComponents, allProjects, helperText, onChange, projectComponents, projectIds, projects }: {
  allProjectComponents: ProjectComponent[];
  allProjects: Project[];
  helperText: string;
  onChange: (projectIds: number[], projectComponents: Record<string, string[]>) => void;
  projectComponents: Record<string, string[]>;
  projectIds: number[];
  projects: { value: string; label: string }[];
}) {
  const selectedProjects = projectIds
    .map((projectId) => allProjects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project));

  return <>
    <MultiSelect helperText={helperText} label="Dự án" onChange={(nextIds) => {
      const nextProjectIds = nextIds.map(Number);
      const nextProjectComponents = Object.fromEntries(Object.entries(projectComponents).filter(([projectId]) => nextProjectIds.includes(Number(projectId))));
      onChange(nextProjectIds, nextProjectComponents);
    }} options={projects} placeholder="Chọn dự án" value={projectIds.map(String)} />
    {selectedProjects.length > 0 && <div className="ui-form-section flex flex-col gap-3 rounded-lg border border-fb-border bg-fb-surface-muted p-3">
      <p className="text-xs font-semibold text-fb-text-secondary">Giới hạn theo Component (tùy chọn) — bỏ trống nghĩa là user có quyền với toàn bộ issue của dự án đó.</p>
      {selectedProjects.map((project) => {
        const componentOptions = allProjectComponents
          .filter((component) => component.projectKey === project.sourceProjectKey && component.isActive)
          .map((component) => ({ value: component.componentName, label: component.componentName }));
        return <MultiSelect
          key={project.id}
          helperText={componentOptions.length === 0 ? 'Dự án này chưa có Component nào trong danh mục.' : undefined}
          label={`${project.sourceProjectKey} — ${project.projectName}`}
          onChange={(components) => onChange(projectIds, { ...projectComponents, [String(project.id)]: components })}
          options={componentOptions}
          placeholder="Toàn quyền dự án (không giới hạn Component)"
          value={projectComponents[String(project.id)] ?? []}
        />;
      })}
    </div>}
  </>;
}
