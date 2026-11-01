'use client';

import * as React from 'react';
import { CalendarBlank, Eye, FolderOpen, Kanban } from '@phosphor-icons/react';
import { ChipAutocompleteInput, type ChipSuggestion } from '@/components/ui/ChipAutocompleteInput';
import { Input } from '@/components/ui/Input';
import { ProjectComponentFields } from '@/components/users/ProjectComponentFields';
import type { Project, ProjectComponent } from '@/lib/master-data-types';
import type { UserViewGrantsDetail } from '@/lib/user-view-grants';

/**
 * Tab "Quyền xem" of the "Chỉnh sửa user" popup (owner 2026-11-01): extra Epics the user may SEE in Quản trị Epic —
 * never counted in any metric. Three parts: projects (+ component narrowing — the very block of tab "Phân quyền",
 * ProjectComponentFields), single Epics
 * (chips with suggestions) and "Giới hạn thời gian" for the project grants.
 */

function Section({ children, description, icon: SectionIcon, title }: { children: React.ReactNode; description: string; icon: typeof Eye; title: string }) {
  return (
    <section className="ui-form-section flex flex-col gap-3">
      <div>
        <h3 className="m-0 flex items-center gap-2 text-sm font-bold text-fb-text-primary">
          <SectionIcon className="size-4 text-[var(--color-text-brand)]" weight="fill" aria-hidden="true" />
          {title}
        </h3>
        <p className="m-0 mt-1 text-xs text-fb-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}

async function fetchEpicSuggestions(query: string, signal: AbortSignal): Promise<ChipSuggestion[]> {
  // A few more than shown: the input drops the Epics already chosen, then keeps the closest 3.
  const response = await fetch(`/api/users/view-grants/epic-suggestions?q=${encodeURIComponent(query)}&limit=8`, { signal });
  if (!response.ok) return [];
  const rows = (await response.json()) as { epicKey: string; epicName: string }[];
  return rows.map((row) => ({ description: row.epicName, label: row.epicKey, value: row.epicKey }));
}

export function UserViewGrantsFields({ allProjectComponents, allProjects, disabled, grants, onChange, projectOptions }: {
  allProjectComponents: ProjectComponent[];
  allProjects: Project[];
  disabled: boolean;
  grants: UserViewGrantsDetail;
  onChange: (next: UserViewGrantsDetail) => void;
  projectOptions: { value: string; label: string }[];
}) {
  const epicNameOf = new Map(grants.epics.map((epic) => [epic.epicKey, epic.epicName]));

  return (
    <div className="ui-form flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-lg border border-fb-border bg-fb-surface-muted px-3 py-2 text-xs text-fb-text-secondary">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Chỉ là quyền <strong>xem</strong> trong màn hình Quản trị Epic: các Epic này hiện kèm biểu tượng con mắt, không được tính vào bất kỳ chỉ số nào và không hiện ở Dashboard.</span>
      </div>

      <Section description="Chọn dự án; không chọn Component nào nghĩa là xem được mọi Epic của dự án đó." icon={FolderOpen} title="Quyền xem Dự án">
        <ProjectComponentFields
          allProjectComponents={allProjectComponents}
          allProjects={allProjects}
          helperText="Tùy chọn. Chọn các dự án user được xem thêm trong màn hình Quản trị Epic."
          onChange={(projectIds, projectComponents) => onChange({
            ...grants,
            projects: projectIds.map((projectId) => ({ components: projectComponents[String(projectId)] ?? [], projectId })),
          })}
          projectComponents={Object.fromEntries(grants.projects.map((grant) => [String(grant.projectId), grant.components]))}
          projectIds={grants.projects.map((grant) => grant.projectId)}
          projects={projectOptions}
        />
      </Section>

      <Section description="Gõ Epic key để tìm (gợi ý 3 Epic gần nhất), chọn để thêm. Epic chọn đích danh luôn hiện, không áp Giới hạn thời gian." icon={Kanban} title="Quyền xem Epic">
        <ChipAutocompleteInput
          disabled={disabled}
          fetchSuggestions={fetchEpicSuggestions}
          label="Epic"
          onAdd={(suggestion) => onChange({
            ...grants,
            epicKeys: [...grants.epicKeys, suggestion.value],
            epics: [...grants.epics, { epicKey: suggestion.value, epicName: suggestion.description ?? '' }],
          })}
          onRemove={(epicKey) => onChange({
            ...grants,
            epicKeys: grants.epicKeys.filter((key) => key !== epicKey),
            epics: grants.epics.filter((epic) => epic.epicKey !== epicKey),
          })}
          placeholder="Nhập Epic key, ví dụ SC-81097"
          value={grants.epicKeys.map((epicKey) => ({ title: epicNameOf.get(epicKey) || undefined, value: epicKey }))}
        />
      </Section>

      <Section description="Chỉ áp dụng cho Epic có được từ Quyền xem Dự án. Để trống = không lọc theo tiêu chí đó; Epic chưa có Start Date không thoả điều kiện Start Date." icon={CalendarBlank} title="Giới hạn thời gian">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            disabled={disabled}
            helperText="Epic tạo trên Jira sau ngày này."
            label="Created date sau:"
            onChange={(event) => onChange({ ...grants, createdAfter: event.target.value || null })}
            type="date"
            value={grants.createdAfter ?? ''}
          />
          <Input
            disabled={disabled}
            helperText="Epic có Start Date sau ngày này."
            label="Start Date sau:"
            onChange={(event) => onChange({ ...grants, startAfter: event.target.value || null })}
            type="date"
            value={grants.startAfter ?? ''}
          />
        </div>
      </Section>
    </div>
  );
}
