'use client';

import { useEffect, useState } from 'react';
import { CaretDown, CaretUp, CaretUpDown, Eye, EyeSlash, Plus } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { showToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { DataTableToolbar } from '@/components/ui/DataTableToolbar';
import { TableAction } from '@/components/ui/TableAction';
import { InfoBannerDisplay } from '@/components/layout/InfoBannerDisplay';
import { ProjectComponentFields } from '@/components/users/ProjectComponentFields';
import { UserViewGrantsFields } from '@/components/users/UserViewGrantsFields';
import { roleUsesViewGrants, type UserViewGrantsDetail } from '@/lib/user-view-grants';
import { canGrantRole, USER_ROLES } from '@/lib/auth-types';
import { generateCompliantPassword, PASSWORD_REQUIREMENTS_GUIDE, validatePassword } from '@/lib/password-rules';
import { fuzzyIncludes } from '@/lib/fuzzy-search';
import { extractUsername } from '@/lib/username';
import { compareValues, useSortableList } from '@/lib/use-sortable-list';
import type { ManagedUser, UserInput, UserRole } from '@/lib/auth-types';
import type { Domain, Project, ProjectComponent } from '@/lib/master-data-types';
import type { UserReportGrant, UserReportRow } from '@/lib/user-admin-report-service';
import { formatCommentStamp } from '@/lib/epic-mark-format';
import { PENDING_USER_TICKETS_CHANGED_EVENT } from '@/lib/admin-pending-events';
import { cn } from '@/lib/utils';

type Tab = 'users' | 'reset' | 'registrations' | 'report';
type EditUserTab = 'info' | 'permission' | 'view' | 'password';
type UserSortKey = 'username' | 'email' | 'fullName' | 'domain' | 'projects' | 'role' | 'status';
type ReportSortKey = 'username' | 'fullName' | 'role' | 'domain' | 'assignments' | 'view' | 'loginCount' | 'lastLoginAt' | 'tokens';
type ReportSort = { direction: 'asc' | 'desc'; key: ReportSortKey };
type Ticket = { createdAt: string; email: string; id: number; userId: number | null };
type BulkDelete = { ids: number[]; type: 'registrations' | 'tickets'; usernames?: string[] };

const emptyUser = (): UserInput => ({ domainIds: [], email: '', fullName: '', isActive: true, password: '', projectComponents: {}, projectIds: [], role: 'USER' });
const randomPassword = () => generateCompliantPassword();
const PAGE_SIZE = 20;
/** Tab "Báo cáo user": 30 users per page (owner 2026-11-02). */
const REPORT_PAGE_SIZE = 30;
/** Default order of "Báo cáo user" (owner 2026-11-02): Superadmin, Supervisor, Admin, User, then every inactive user. */
const REPORT_ROLE_RANK: Record<string, number> = { SUPERADMIN: 0, SUPERVISOR: 1, ADMIN: 2, USER: 3 };
const reportRoleRank = (row: UserReportRow) => (row.isActive ? REPORT_ROLE_RANK[row.role] ?? 4 : 5);
function reportSortValue(row: UserReportRow, key: ReportSortKey): string | number | null {
  if (key === 'role') return reportRoleRank(row);
  if (key === 'domain') return row.domains.join(', ') || null;
  if (key === 'assignments') return row.assignments.map((grant) => grant.projectKey).join(', ') || null;
  if (key === 'view') return row.viewEpicTotal;
  if (key === 'tokens') return row.activeTokenCount;
  if (key === 'loginCount') return row.loginCount;
  if (key === 'lastLoginAt') return row.lastLoginAt;
  return row[key];
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('users');
  // Which roles THIS logged-in actor may grant — mirrors the server-side canGrantRole check in
  // /api/users (ADMIN/SUPERVISOR can only grant a role below their own; SUPERADMIN grants any role).
  // null while /api/auth/me hasn't resolved yet, so the Role select stays fully restricted (safe
  // default) rather than briefly offering every role.
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectComponents, setProjectComponents] = useState<ProjectComponent[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editTab, setEditTab] = useState<EditUserTab>('info');
  // Tab "Quyền xem" (USER / ADMIN targets only): loaded when the popup opens, saved with "Lưu" when changed.
  const [viewGrants, setViewGrants] = useState<UserViewGrantsDetail | null>(null);
  const [viewGrantsDirty, setViewGrantsDirty] = useState(false);
  const editingId = editing?.id ?? null;
  const [creating, setCreating] = useState(false);
  const [creatingBulk, setCreatingBulk] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [createForm, setCreateForm] = useState<UserInput>(emptyUser);
  const [bulkUsernames, setBulkUsernames] = useState('');
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [resetTickets, setResetTickets] = useState<Ticket[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([]);
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<number[]>([]);
  const [approvalUserIds, setApprovalUserIds] = useState<number[]>([]);
  const [approvalDomainId, setApprovalDomainId] = useState('');
  const [bulkDelete, setBulkDelete] = useState<BulkDelete | null>(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  // "Đã đọc" of tab "Duyệt đăng ký mới" — the signed-in admin's own read state (user_registration_reads).
  const [readRegistrationIds, setReadRegistrationIds] = useState<number[]>([]);
  // Tab "Báo cáo user" — loaded each time the tab is opened.
  const [reportRows, setReportRows] = useState<UserReportRow[] | null>(null);
  const [reportSort, setReportSort] = useState<ReportSort>({ direction: 'asc', key: 'role' });
  const toggleReportSort = (key: ReportSortKey) => { setReportSort((current) => (current.key === key ? { direction: current.direction === 'asc' ? 'desc' : 'asc', key } : { direction: 'asc', key })); setPage(1); };

  const load = async () => {
    const [usersResponse, ticketsResponse, domainsResponse, projectsResponse, componentsResponse] = await Promise.all([fetch('/api/users'), fetch('/api/password-reset-requests'), fetch('/api/domains'), fetch('/api/projects'), fetch('/api/project-components')]);
    if (usersResponse.ok) setUsers(await usersResponse.json());
    if (ticketsResponse.ok) setTickets(await ticketsResponse.json());
    if (domainsResponse.ok) setDomains((await domainsResponse.json()).filter((domain: Domain) => domain.isActive));
    if (projectsResponse.ok) setProjects(await projectsResponse.json());
    if (componentsResponse.ok) setProjectComponents(await componentsResponse.json());
    const readsResponse = await fetch('/api/users/registration-reads');
    if (readsResponse.ok) setReadRegistrationIds((await readsResponse.json()).readIds ?? []);
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);
  useEffect(() => {
    if (editingId === null) return undefined;
    const controller = new AbortController();
    fetch(`/api/users/view-grants?userId=${editingId}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: UserViewGrantsDetail | null) => { if (!controller.signal.aborted && data) setViewGrants(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [editingId]);
  useEffect(() => {
    if (tab !== 'report') return undefined;
    const controller = new AbortController();
    fetch('/api/users/report', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { rows?: UserReportRow[] } | null) => { if (!controller.signal.aborted) setReportRows(data?.rows ?? []); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [tab]);
  useEffect(() => { fetch('/api/auth/me').then((response) => (response.ok ? response.json() : null)).then((data: { user?: { role: UserRole } } | null) => { if (data?.user) setCurrentUserRole(data.user.role); }).catch(() => undefined); }, []);
  const domainOptions = [{ value: '', label: 'Chọn Domain' }, ...domains.map((domain) => ({ value: String(domain.id), label: `${domain.domainCode} — ${domain.domainName}` }))];
  const domainMultiOptions = domains.map((domain) => ({ value: String(domain.id), label: `${domain.domainCode} — ${domain.domainName}` }));
  const projectMultiOptions = projects.map((project) => ({ value: String(project.id), label: `${project.sourceProjectKey} — ${project.projectName}${project.isActive ? '' : ' (Inactive)'}` }));
  const inactiveUsers = users.filter((user) => !user.isActive);
  const domainName = (user: ManagedUser) => user.domainIds.map((domainId) => domains.find((domain) => domain.id === domainId)?.domainName).filter((name): name is string => Boolean(name)).join(', ') || '-';
  const projectKeys = (user: ManagedUser) => user.projectIds.map((projectId) => projects.find((project) => project.id === projectId)?.sourceProjectKey).filter((key): key is string => Boolean(key)).join(', ') || '-';
  const toggle = (id: number, checked: boolean, selected: number[], setSelected: (ids: number[]) => void) => setSelected(checked ? [...selected, id] : selected.filter((value) => value !== id));
  const { sortKey: userSortKey, toggleSort: toggleUserSort, directionFor: userSortDirection } = useSortableList<UserSortKey>('username');
  const userSortValue = (user: ManagedUser, key: UserSortKey): string => {
    if (key === 'username') return extractUsername(user.email);
    if (key === 'domain') return domainName(user);
    if (key === 'projects') return projectKeys(user);
    if (key === 'status') return user.isActive ? 'active' : 'inactive';
    return user[key];
  };
  const visibleUsers = users
    .filter((user) => fuzzyIncludes(searchTerm, [extractUsername(user.email), user.email, user.fullName, domainName(user), projectKeys(user), user.role, user.isActive ? 'active' : 'inactive']))
    .sort((a, b) => compareValues(userSortValue(a, userSortKey), userSortValue(b, userSortKey), userSortDirection(userSortKey) ?? 'asc'));
  const totalUserPages = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const currentUserPage = Math.min(page, totalUserPages);
  const pageUsers = visibleUsers.slice((currentUserPage - 1) * PAGE_SIZE, currentUserPage * PAGE_SIZE);
  const visibleTickets = tickets.filter((ticket) => fuzzyIncludes(searchTerm, [extractUsername(ticket.email), ticket.email, ticket.createdAt]));
  const readRegistrationSet = new Set(readRegistrationIds);
  const unreadRegistrationCount = inactiveUsers.filter((user) => !readRegistrationSet.has(user.id)).length;
  const grantText = (grants: UserReportGrant[]) => grants.map((grant) => `${grant.projectKey} ${grant.components.length ? grant.components.join(', ') : 'toàn bộ'}`).join(' ');
  const visibleReportRows = (reportRows ?? []).filter((row) => fuzzyIncludes(searchTerm, [row.username, row.fullName, row.role, row.domains.join(', '), grantText(row.assignments), grantText(row.viewProjects)]));
  // Sorted by the chosen column; ties (and the default Role order) always fall back to Username A-Z.
  visibleReportRows.sort((a, b) => compareValues(reportSortValue(a, reportSort.key), reportSortValue(b, reportSort.key), reportSort.direction) || compareValues(a.username, b.username, 'asc'));
  const totalReportPages = Math.max(1, Math.ceil(visibleReportRows.length / REPORT_PAGE_SIZE));
  const currentReportPage = Math.min(page, totalReportPages);
  const pageReportRows = visibleReportRows.slice((currentReportPage - 1) * REPORT_PAGE_SIZE, currentReportPage * REPORT_PAGE_SIZE);
  const visibleInactiveUsers = inactiveUsers.filter((user) => fuzzyIncludes(searchTerm, [extractUsername(user.email), user.email, user.fullName, domainName(user)]));

  const closeEdit = () => { setEditing(null); setEditTab('info'); setViewGrants(null); setViewGrantsDirty(false); setEditNewPassword(''); setEditConfirmPassword(''); setShowEditNewPassword(false); setShowEditConfirmPassword(false); };

  const save = async () => {
    if (!editing) return;
    if (editing.isActive && editing.domainIds.length === 0) { setMessage({ text: 'User active phải thuộc ít nhất một Domain.', type: 'error' }); return; }
    if (editNewPassword || editConfirmPassword) {
      const v = validatePassword(editNewPassword);
      if (!v.isValid) { setMessage({ text: v.error || 'Mật khẩu mới không hợp lệ.', type: 'error' }); return; }
      if (editNewPassword !== editConfirmPassword) { setMessage({ text: 'Mật khẩu nhập lại không khớp.', type: 'error' }); return; }
    }
    const response = await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error || 'Không thể cập nhật user.', type: 'error' }); return; }
    if (editNewPassword) {
      const pwResponse = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, password: editNewPassword }) });
      const pwResult = await pwResponse.json();
      if (!pwResponse.ok) { setMessage({ text: pwResult.error || 'Đã cập nhật user nhưng không thể cấp lại mật khẩu.', type: 'error' }); void load(); return; }
    }
    if (viewGrants && viewGrantsDirty && roleUsesViewGrants(editing.role)) {
      const grantsResponse = await fetch('/api/users/view-grants', {
        body: JSON.stringify({ createdAfter: viewGrants.createdAfter, epicKeys: viewGrants.epicKeys, projects: viewGrants.projects, startAfter: viewGrants.startAfter, userId: editing.id }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });
      const grantsResult = await grantsResponse.json();
      if (!grantsResponse.ok) { setMessage({ text: grantsResult.error || 'Đã cập nhật user nhưng không thể lưu Quyền xem.', type: 'error' }); void load(); return; }
    }
    closeEdit();
    showToast('Đã cập nhật user.', 5000);
    setMessage(null);
    void load();
  };

  const create = async () => {
    if (createForm.isActive && createForm.domainIds.length === 0) { setMessage({ text: 'User active phải thuộc ít nhất một Domain.', type: 'error' }); return; }
    const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm) });
    const result = await response.json();
    if (response.ok) { setCreating(false); showToast('Đã tạo user.', 5000); setMessage(null); void load(); }
    else setMessage({ text: result.error || 'Không thể tạo user.', type: 'error' });
  };

  const createBulkUsers = async () => {
    const usernames = bulkUsernames.split(',').map((username) => username.trim()).filter(Boolean);
    if (usernames.length === 0) { setMessage({ text: 'Nhập ít nhất một username.', type: 'error' }); return; }
    setIsBulkSaving(true);
    try {
      const response = await fetch('/api/users/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames }) });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Không thể thêm nhiều user.', type: 'error' }); return; }
      setCreatingBulk(false); setBulkUsernames('');
      showToast(`Đã thêm ${result.created.length} user inactive${result.skipped.length ? `; bỏ qua ${result.skipped.length} user đã tồn tại` : ''}.`, 5000);
      setMessage(null);
      void load();
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsBulkSaving(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/users?id=${deleting.id}&username=${encodeURIComponent(extractUsername(deleting.email))}`, { method: 'DELETE' });
    const result = await response.json();
    if (response.ok) { setDeleting(null); setEditing(null); showToast('Đã xóa user.', 5000); setMessage(null); void load(); }
    else setMessage({ text: result.error || 'Không thể xóa user.', type: 'error' });
  };

  const reset = async () => {
    if (resetTickets.length === 0) return;
    const v = validatePassword(password);
    if (!v.isValid) { setMessage({ text: v.error || 'Mật khẩu mới không hợp lệ.', type: 'error' }); return; }
    const response = await fetch('/api/password-reset-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets: resetTickets.map(({ id, userId }) => ({ id, userId })), password }) });
    const result = await response.json();
    if (response.ok) { const count = resetTickets.length; setResetTickets([]); setSelectedTicketIds([]); showToast(`Đã cấp lại mật khẩu cho ${count} user.`, 5000); setMessage(null); void load(); }
    else setMessage({ text: result.error || 'Không thể cấp lại mật khẩu.', type: 'error' });
  };

  const approve = async (ids: number[], domainId?: number) => {
    try {
      const usernames = users.filter((u) => ids.includes(u.id)).map((u) => extractUsername(u.email));
      const response = await fetch('/api/users/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, usernames, ...(domainId ? { domainId } : {}) }) });
      const result = await response.json();
      if (response.ok) { setApprovalUserIds([]); setApprovalDomainId(''); setSelectedRegistrationIds([]); showToast(`Đã duyệt ${result.approved} đăng ký mới${result.domainAssigned ? ` và gán Domain cho ${result.domainAssigned} user` : ''}.`, 5000); setMessage(null); void load(); }
      else setMessage({ text: result.error || 'Không thể duyệt đăng ký.', type: 'error' });
    } catch { setMessage({ text: 'Không thể kết nối dịch vụ duyệt đăng ký.', type: 'error' }); }
  };

  const markRegistrationsRead = async (ids: number[]) => {
    const unread = ids.filter((id) => !readRegistrationSet.has(id));
    if (unread.length === 0) { showToast('Các đăng ký đã chọn đều đã được đánh dấu đã đọc.', 4000); return; }
    try {
      const response = await fetch('/api/users/registration-reads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: unread }) });
      const result = await response.json();
      if (!response.ok) { setMessage({ text: result.error || 'Không thể đánh dấu đã đọc.', type: 'error' }); return; }
      setReadRegistrationIds(result.readIds ?? []);
      setSelectedRegistrationIds([]);
      window.dispatchEvent(new Event(PENDING_USER_TICKETS_CHANGED_EVENT));
      showToast(`Đã đánh dấu đã đọc ${result.marked ?? unread.length} đăng ký mới.`, 4000);
      setMessage(null);
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); }
  };

  const requestApproval = (selectedUsers: ManagedUser[]) => {
    if (selectedUsers.length === 0) return;
    if (selectedUsers.some((user) => user.domainIds.length === 0)) { setApprovalUserIds(selectedUsers.map((user) => user.id)); setApprovalDomainId(''); return; }
    void approve(selectedUsers.map((user) => user.id));
  };

  const deleteSelected = async () => {
    if (!bulkDelete) return;
    const response = bulkDelete.type === 'tickets'
      ? await fetch('/api/password-reset-requests', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: bulkDelete.ids }) })
      : await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: bulkDelete.ids, usernames: bulkDelete.usernames }) });
    const result = await response.json();
    if (response.ok) { const count = typeof result.deleted === 'number' ? result.deleted : bulkDelete.ids.length; showToast(`Đã xóa ${count} yêu cầu.`, 5000); setMessage(null); if (bulkDelete.type === 'tickets') setSelectedTicketIds([]); else setSelectedRegistrationIds([]); setBulkDelete(null); void load(); }
    else setMessage({ text: result.error || 'Không thể xóa các mục đã chọn.', type: 'error' });
  };

  return <div className="flex flex-col gap-6">
    <InfoBannerDisplay pathname="/admin/users" />
    <nav className="ui-tabs" aria-label="Quản lý user">{([['users', 'Quản lý user', 0], ['reset', 'Yêu cầu cấp lại mật khẩu', tickets.length], ['registrations', 'Duyệt đăng ký mới', unreadRegistrationCount], ['report', 'Báo cáo user', 0]] as [Tab, string, number][]).map(([key, label, count]) => <Button key={key} onClick={() => { setTab(key); setPage(1); }} variant={tab === key ? 'primary' : 'outline'}><span>{label}</span>{count > 0 && <Badge className="ml-1" variant={key === 'reset' ? 'warning' : 'info'}>{count}</Badge>}</Button>)}</nav>
    {message && <Alert title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}
    <Card><CardHeader><CardTitle>{tab === 'users' ? 'Quản lý user' : tab === 'reset' ? 'Yêu cầu cấp lại mật khẩu' : tab === 'report' ? 'Báo cáo user' : 'Duyệt đăng ký mới'}</CardTitle>
      {tab === 'users' && <div className="flex gap-2"><Button size="sm" onClick={() => { setBulkUsernames(''); setCreatingBulk(true); }} variant="outline">Thêm nhiều user</Button><Button size="sm" icon={<Plus className="size-4" weight="bold" />} onClick={() => { setCreateForm(emptyUser()); setCreating(true); }}>Thêm user</Button></div>}
      {tab === 'reset' && selectedTicketIds.length > 0 && <div className="ui-button-group flex gap-2"><Button onClick={() => setBulkDelete({ ids: selectedTicketIds, type: 'tickets' })} size="sm" variant="danger">Xóa ({selectedTicketIds.length})</Button><Button onClick={() => { const selected = tickets.filter((ticket) => selectedTicketIds.includes(ticket.id) && ticket.userId !== null); setResetTickets(selected); setPassword(randomPassword()); }} size="sm">Cấp lại mật khẩu ({selectedTicketIds.length})</Button></div>}
      {tab === 'registrations' && selectedRegistrationIds.length > 0 && <div className="ui-button-group flex gap-2"><Button onClick={() => setBulkDelete({ ids: selectedRegistrationIds, type: 'registrations', usernames: inactiveUsers.filter((u) => selectedRegistrationIds.includes(u.id)).map((u) => extractUsername(u.email)) })} size="sm" variant="danger">Xóa ({selectedRegistrationIds.length})</Button><Button size="sm" variant="outline" onClick={() => void markRegistrationsRead(selectedRegistrationIds)}>Đã đọc ({selectedRegistrationIds.length})</Button><Button onClick={() => requestApproval(inactiveUsers.filter((user) => selectedRegistrationIds.includes(user.id)))} size="sm">Duyệt đăng ký ({selectedRegistrationIds.length})</Button></div>}
    </CardHeader><CardBody>
      <DataTableToolbar onReset={() => { setSearchTerm(''); setPage(1); }} onSearchChange={(value) => { setSearchTerm(value); setPage(1); }} placeholder={tab === 'users' ? 'Tìm username, email, họ tên, Domain, Dự án hoặc role' : tab === 'reset' ? 'Tìm username, email hoặc thời gian gửi' : tab === 'report' ? 'Tìm username, họ tên, role, Domain, dự án hoặc component' : 'Tìm username, email, họ tên hoặc Domain'} searchValue={searchTerm} />
      {tab === 'users' && (visibleUsers.length ? <><TableContainer><Table><THead><TR>
        <TH>STT</TH>
        <TH sortDirection={userSortDirection('username')} onClick={() => toggleUserSort('username')}>Username</TH>
        <TH sortDirection={userSortDirection('email')} onClick={() => toggleUserSort('email')}>Email</TH>
        <TH sortDirection={userSortDirection('fullName')} onClick={() => toggleUserSort('fullName')}>Họ tên</TH>
        <TH sortDirection={userSortDirection('domain')} onClick={() => toggleUserSort('domain')}>Domain</TH>
        <TH sortDirection={userSortDirection('projects')} onClick={() => toggleUserSort('projects')}>Dự án</TH>
        <TH sortDirection={userSortDirection('role')} onClick={() => toggleUserSort('role')}>Role</TH>
        <TH sortDirection={userSortDirection('status')} onClick={() => toggleUserSort('status')}>Trạng thái</TH>
        <TH className="text-center" title="Số lượt đăng nhập (cộng dồn theo ngày)">Đăng nhập</TH>
        <TH className="text-center" title="Số lượt bấm menu chức năng ở left panel và menu avatar (cộng dồn theo ngày)">Chức năng</TH>
        <TH className="text-center" title="Số lượt xem lịch sử cảnh báo Epic, duyệt Epic và chuyển trang trên màn hình quản lý Epic (cộng dồn theo ngày)">Dữ liệu</TH>
        <TH>Hành động</TH>
      </TR></THead><TBody>{pageUsers.map((user, index) => <TR key={user.id}><TD>{(currentUserPage - 1) * PAGE_SIZE + index + 1}</TD><TD className="font-semibold text-fb-text-primary">{extractUsername(user.email)}</TD><TD>{user.email}</TD><TD>{user.fullName}</TD><TD>{domainName(user)}</TD><TD>{projectKeys(user)}</TD><TD><Badge variant="info">{user.role}</Badge></TD><TD><Badge variant={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Active' : 'Inactive'}</Badge></TD><TD className="text-center">{user.usageStats.loginCount}</TD><TD className="text-center">{user.usageStats.featureCount}</TD><TD className="text-center">{user.usageStats.dataCount}</TD><TD><TableAction onClick={() => { setEditing({ ...user }); setEditTab('info'); setEditNewPassword(''); setEditConfirmPassword(''); setShowEditNewPassword(false); setShowEditConfirmPassword(false); }} variant="info">Chỉnh sửa</TableAction></TD></TR>)}</TBody></Table></TableContainer><Pagination currentPage={currentUserPage} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={visibleUsers.length} itemLabel="user" /></> : <p className="text-fb-text-secondary">Không tìm thấy user phù hợp.</p>)}
      {tab === 'reset' && (tickets.length ? (visibleTickets.length ? <TableContainer><Table><THead><TR><TH className="text-center"><input aria-label="Chọn tất cả yêu cầu cấp lại mật khẩu" checked={visibleTickets.length > 0 && visibleTickets.every((ticket) => selectedTicketIds.includes(ticket.id))} onChange={(event) => setSelectedTicketIds(event.target.checked ? [...new Set([...selectedTicketIds, ...visibleTickets.map((ticket) => ticket.id)])] : selectedTicketIds.filter((id) => !visibleTickets.some((ticket) => ticket.id === id)))} type="checkbox" /></TH><TH>Username</TH><TH>Email</TH><TH>Thời gian gửi</TH><TH>Hành động</TH></TR></THead><TBody>{visibleTickets.map((ticket) => <TR key={ticket.id}><TD className="text-center"><input aria-label={`Chọn yêu cầu của ${extractUsername(ticket.email)}`} checked={selectedTicketIds.includes(ticket.id)} onChange={(event) => toggle(ticket.id, event.target.checked, selectedTicketIds, setSelectedTicketIds)} type="checkbox" /></TD><TD className="font-semibold text-fb-text-primary">{extractUsername(ticket.email)}</TD><TD>{ticket.email}</TD><TD>{ticket.createdAt}</TD><TD>{ticket.userId ? <TableAction onClick={() => { setResetTickets([ticket]); setPassword(randomPassword()); }} variant="warning">Cấp lại</TableAction> : 'Không tìm thấy user'}</TD></TR>)}</TBody></Table></TableContainer> : <p className="text-fb-text-secondary">Không tìm thấy ticket phù hợp.</p>) : <p className="text-fb-text-secondary">Không có ticket đang chờ.</p>)}
      {tab === 'registrations' && (visibleInactiveUsers.length ? <TableContainer><Table><THead><TR><TH className="text-center"><input aria-label="Chọn tất cả đăng ký mới" checked={visibleInactiveUsers.length > 0 && visibleInactiveUsers.every((user) => selectedRegistrationIds.includes(user.id))} onChange={(event) => setSelectedRegistrationIds(event.target.checked ? [...new Set([...selectedRegistrationIds, ...visibleInactiveUsers.map((user) => user.id)])] : selectedRegistrationIds.filter((id) => !visibleInactiveUsers.some((user) => user.id === id)))} type="checkbox" /></TH><TH>Username</TH><TH>Email</TH><TH>Họ tên</TH><TH>Domain</TH><TH>Hành động</TH></TR></THead><TBody>{visibleInactiveUsers.map((user) => <TR key={user.id}><TD className="text-center"><input aria-label={`Chọn đăng ký của ${extractUsername(user.email)}`} checked={selectedRegistrationIds.includes(user.id)} onChange={(event) => toggle(user.id, event.target.checked, selectedRegistrationIds, setSelectedRegistrationIds)} type="checkbox" /></TD><TD className={readRegistrationSet.has(user.id) ? 'text-fb-text-primary' : 'font-bold text-fb-text-primary'}>{extractUsername(user.email)}{!readRegistrationSet.has(user.id) && <Badge className="ml-1.5" variant="info">Mới</Badge>}</TD><TD>{user.email}</TD><TD>{user.fullName}</TD><TD>{domainName(user)}</TD><TD><div className="flex flex-wrap items-center gap-2"><TableAction onClick={() => requestApproval([user])} variant="info">Duyệt</TableAction>{readRegistrationSet.has(user.id) ? <span className="text-xs text-fb-text-placeholder">Đã đọc</span> : <TableAction onClick={() => void markRegistrationsRead([user.id])} variant="neutral">Đã đọc</TableAction>}</div></TD></TR>)}</TBody></Table></TableContainer> : <p className="text-fb-text-secondary">Không tìm thấy đăng ký phù hợp.</p>)}
      {tab === 'report' && (reportRows === null
        ? <p className="text-fb-text-secondary">Đang tải báo cáo user…</p>
        : visibleReportRows.length
          ? <><UserReportTable offset={(currentReportPage - 1) * REPORT_PAGE_SIZE} onSort={toggleReportSort} rows={pageReportRows} sort={reportSort} /><Pagination currentPage={currentReportPage} onPageChange={setPage} pageSize={REPORT_PAGE_SIZE} totalItems={visibleReportRows.length} itemLabel="user" /></>
          : <p className="text-fb-text-secondary">Không tìm thấy user phù hợp.</p>)}
    </CardBody></Card>
    <Modal isOpen={creating} onClose={() => setCreating(false)} maxWidth="xl" title="Thêm user mới" footer={<><Button onClick={() => setCreating(false)} variant="outline">Hủy</Button><Button onClick={create}>Lưu</Button></>}><UserForm allProjects={projects} allProjectComponents={projectComponents} currentUserRole={currentUserRole} domains={domainMultiOptions} onChange={setCreateForm} projects={projectMultiOptions} user={createForm} withPassword /></Modal>
    <Modal isOpen={creatingBulk} onClose={() => setCreatingBulk(false)} title="Thêm nhiều user" footer={<><Button onClick={() => setCreatingBulk(false)} variant="outline">Hủy</Button><Button isLoading={isBulkSaving} onClick={createBulkUsers}>Thêm user</Button></>}><div className="ui-form flex flex-col gap-4"><FormField id="bulk-usernames" label="Danh sách username" helperText="Nhập username, ngăn cách bằng dấu phẩy; không cần @mbbank.com.vn."><textarea className="ui-textarea form-control-compact" onChange={(event) => setBulkUsernames(event.target.value)} placeholder="minhnd7, ngothanhha, congha" value={bulkUsernames} /></FormField><p className="text-fb-text-secondary">User mới có Họ tên là username, email dạng username@mbbank.com.vn, role USER, inactive, chưa gán Domain và mật khẩu mặc định theo cấu hình yêu cầu.</p></div></Modal>
    <Modal isOpen={approvalUserIds.length > 0} onClose={() => setApprovalUserIds([])} title="Chọn Domain để duyệt đăng ký" footer={<><Button onClick={() => setApprovalUserIds([])} variant="outline">Hủy</Button><Button disabled={!approvalDomainId} onClick={() => void approve(approvalUserIds, Number(approvalDomainId))}>Duyệt đăng ký</Button></>}><div className="ui-form flex flex-col gap-4"><p className="text-fb-text-secondary">Các user được chọn chưa có Domain. Chọn một Domain active để gán trước khi kích hoạt {approvalUserIds.length} user.</p><Select label="Domain" onChange={(event) => setApprovalDomainId(event.target.value)} options={domainOptions} required value={approvalDomainId} /></div></Modal>
    <Modal isOpen={editing !== null} onClose={closeEdit} maxWidth="xl" title="Chỉnh sửa user" footer={<><Button onClick={save}>Lưu</Button><Button onClick={() => setDeleting(editing)} title="Xóa user" variant="danger">Xóa user</Button></>}>{editing && <div className="flex flex-col gap-4">
      <nav className="ui-tabs" aria-label="Chỉnh sửa user">{([['info', 'Thông tin user'], ['permission', 'Phân quyền'], ...(roleUsesViewGrants(editing.role) ? [['view', 'Quyền xem']] : []), ['password', 'Mật khẩu']] as [EditUserTab, string][]).map(([key, label]) => <Button key={key} onClick={() => setEditTab(key)} size="sm" variant={editTab === key ? 'primary' : 'outline'}>{label}</Button>)}</nav>
      {/* Fixed size (owner 2026-11-02): all tab panels share one grid cell and only the current one is visible, so the
          popup is always as tall as its biggest tab ("Quyền xem") and never resizes when switching tabs. */}
      <div className="grid">
      {/* "Quyền xem" (owner 2026-11-01) — not offered to SUPERADMIN / SUPERVISOR targets, who see every Epic already. */}
      <div aria-hidden={editTab !== 'view'} className={editPanelClass(editTab, 'view')}>{(roleUsesViewGrants(editing.role)
        ? (viewGrants
          ? <UserViewGrantsFields allProjectComponents={projectComponents} allProjects={projects} disabled={currentUserRole === 'SUPERVISOR'} grants={viewGrants} onChange={(next) => { setViewGrants(next); setViewGrantsDirty(true); }} projectOptions={projectMultiOptions} />
          : <p className="m-0 text-sm text-fb-text-secondary">Đang tải quyền xem…</p>)
        : <p className="m-0 text-sm text-fb-text-secondary">Quyền xem không áp dụng cho role {editing.role} — user này đã xem được mọi Epic.</p>)}</div>
      <div aria-hidden={editTab !== 'info'} className={cn(editPanelClass(editTab, 'info'), 'ui-form flex flex-col gap-4')}>
        <UserIdentityFields domains={domainMultiOptions} onChange={(user) => setEditing(user as ManagedUser)} user={editing} />
        <label className="ui-check"><input checked={editing.isActive} onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })} type="checkbox" />Đang hoạt động (Active)</label>
      </div>
      <div aria-hidden={editTab !== 'permission'} className={cn(editPanelClass(editTab, 'permission'), 'ui-form flex flex-col gap-4')}>
        <UserPermissionFields allProjectComponents={projectComponents} allProjects={projects} currentUserRole={currentUserRole} onChange={(user) => setEditing(user as ManagedUser)} projects={projectMultiOptions} user={editing} />
      </div>
      <section aria-hidden={editTab !== 'password'} aria-labelledby="edit-user-reset-password-title" className={cn(editPanelClass(editTab, 'password'), 'ui-form-section')}>
        <div className="flex items-start justify-between">
          <div>
            <h3 id="edit-user-reset-password-title" className="ui-card-title">Cấp lại mật khẩu</h3>
            <p className="mt-1 text-xs text-fb-text-secondary">Để trống nếu không muốn đổi mật khẩu cho user này.</p>
            <p className="mt-1 text-xs font-medium text-fb-blue">Quy tắc mật khẩu: {PASSWORD_REQUIREMENTS_GUIDE}</p>
          </div>
          <Button onClick={() => {
            const gen = generateCompliantPassword();
            setEditNewPassword(gen);
            setEditConfirmPassword(gen);
            setShowEditNewPassword(true);
            setShowEditConfirmPassword(true);
          }} size="sm" type="button" variant="outline">Tạo ngẫu nhiên</Button>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          <div className="relative">
            <Input className="pr-10" label="Mật khẩu mới" onChange={(event) => setEditNewPassword(event.target.value)} type={showEditNewPassword ? 'text' : 'password'} value={editNewPassword} />
            <button aria-label="Hiện hoặc ẩn mật khẩu" className="absolute right-3 top-9" onClick={() => setShowEditNewPassword(!showEditNewPassword)} type="button">{showEditNewPassword ? <EyeSlash /> : <Eye />}</button>
          </div>
          <div className="relative">
            <Input className="pr-10" label="Nhập lại mật khẩu mới" onChange={(event) => setEditConfirmPassword(event.target.value)} type={showEditConfirmPassword ? 'text' : 'password'} value={editConfirmPassword} />
            <button aria-label="Hiện hoặc ẩn mật khẩu" className="absolute right-3 top-9" onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)} type="button">{showEditConfirmPassword ? <EyeSlash /> : <Eye />}</button>
          </div>
        </div>
      </section>
      </div>
    </div>}</Modal>
    <Modal isOpen={resetTickets.length > 0} onClose={() => setResetTickets([])} title="Cấp lại mật khẩu" footer={<><Button onClick={() => { setBulkDelete({ ids: resetTickets.map((ticket) => ticket.id), type: 'tickets' }); setResetTickets([]); }} variant="danger">Xóa yêu cầu</Button><Button onClick={() => setPassword(randomPassword())} variant="outline">Tạo ngẫu nhiên</Button><Button onClick={reset}>Lưu</Button></>}><div className="flex flex-col gap-4"><p className="text-fb-text-secondary">Mật khẩu mới sẽ áp dụng cho {resetTickets.length} user đã chọn.</p><p className="text-xs font-medium text-fb-blue">Quy tắc mật khẩu: {PASSWORD_REQUIREMENTS_GUIDE}</p><Input label="Mật khẩu mới" onChange={(event) => setPassword(event.target.value)} value={password} /></div></Modal>
    <ConfirmDialog confirmLabel="Xóa user" description={`Bạn có chắc muốn xóa user ${deleting ? extractUsername(deleting.email) : ''}?`} isOpen={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} steps={1} title="Xóa user" />
    <ConfirmDialog confirmLabel="Xóa" description={`Bạn có chắc muốn xóa ${bulkDelete?.ids.length ?? 0} ${bulkDelete?.type === 'tickets' ? 'yêu cầu cấp lại mật khẩu' : 'yêu cầu đăng ký mới'} đã chọn?`} isOpen={bulkDelete !== null} onClose={() => setBulkDelete(null)} onConfirm={deleteSelected} steps={1} title="Xóa các mục đã chọn" />
  </div>;
}

/** One tab panel of "Chỉnh sửa user": every panel sits in the same grid cell; the hidden ones keep their space
 * (`invisible` — not shown, not focusable) so the cell is as big as the biggest panel. */
function editPanelClass(current: EditUserTab, key: EditUserTab): string {
  return cn('min-w-0 [grid-area:1/1]', current === key ? '' : 'invisible pointer-events-none');
}

/** A grant list ("Phân quyền" / "Quyền xem"): one line per project — key, then its components or "toàn bộ dự án". */
function GrantList({ grants }: { grants: UserReportGrant[] }) {
  if (grants.length === 0) return <span className="text-fb-text-placeholder">-</span>;
  return <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{grants.map((grant) => <li key={grant.projectKey}>
    <span className="font-mono font-bold text-fb-text-primary" title={grant.projectName}>{grant.projectKey}</span>
    <span className="text-fb-text-secondary">: {grant.components.length ? grant.components.join(', ') : 'toàn bộ dự án'}</span>
  </li>)}</ul>;
}

/** "Quyền xem" of one user: the granted projects / components, then up to 10 random Epics those grants let them see. */
function ViewGrantCell({ row }: { row: UserReportRow }) {
  if (row.viewProjects.length === 0 && row.viewEpicTotal === 0 && row.viewEpicCount === 0) return <span className="text-fb-text-placeholder">-</span>;
  return <div className="flex flex-col gap-1">
    {row.viewProjects.length > 0 && <GrantList grants={row.viewProjects} />}
    {row.viewEpicCount > 0 && <div className="text-fb-text-secondary">+ {row.viewEpicCount} Epic cấp lẻ</div>}
    {row.viewEpicTotal > 0
      ? <div>
        <div className="text-fb-text-secondary">{row.viewEpicSample.length < row.viewEpicTotal ? `${row.viewEpicSample.length} Epic ngẫu nhiên / tổng ${row.viewEpicTotal}:` : `${row.viewEpicTotal} Epic:`}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">{row.viewEpicSample.map((epic) => <span className="rounded border border-fb-border bg-fb-surface-muted px-1 font-mono text-[11px] text-fb-text-primary" key={epic.epicKey} title={epic.epicName}>{epic.epicKey}</span>)}</div>
      </div>
      : <div className="text-fb-text-placeholder">Chưa có Epic nào khớp quyền xem.</div>}
  </div>;
}

/** Tab "Báo cáo user" (owner 2026-11-02) — same compact bordered table as the Epic Report. */
function UserReportTable({ offset, onSort, rows, sort }: { offset: number; onSort: (key: ReportSortKey) => void; rows: UserReportRow[]; sort: ReportSort }) {
  const cell = 'px-2 py-1.5 align-top border-r border-fb-border';
  const head = 'px-2 py-1.5 border-r border-fb-border whitespace-nowrap';
  // A sortable title: click to sort by it, click again to flip; the arrow shows the current order.
  const sortable = (key: ReportSortKey, label: string) => {
    const active = sort.key === key;
    const SortIcon = !active ? CaretUpDown : sort.direction === 'asc' ? CaretUp : CaretDown;
    return <button className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-bold text-black hover:text-[var(--color-text-brand)]" onClick={() => onSort(key)} type="button">
      {label}<SortIcon aria-hidden="true" className={cn('size-3 shrink-0', !active && 'opacity-40')} weight="bold" />
    </button>;
  };
  const ariaSort = (key: ReportSortKey) => (sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined);
  return <div className="overflow-x-auto rounded border border-fb-border">
    <table className="w-full min-w-[1100px] border-collapse text-left text-[11px]">
      <thead>
        <tr className="select-none border-b border-fb-border bg-fb-surface-muted font-bold text-black">
          <th className={cn(head, 'w-8 text-center')}>STT</th>
          <th aria-sort={ariaSort('username')} className={head}>{sortable('username', 'Username')}</th>
          <th aria-sort={ariaSort('fullName')} className={head}>{sortable('fullName', 'Họ tên')}</th>
          <th aria-sort={ariaSort('role')} className={head} title="Mặc định: Superadmin, Supervisor, Admin, User, Inactive — rồi theo Username A-Z">{sortable('role', 'Role')}</th>
          <th aria-sort={ariaSort('domain')} className={head}>{sortable('domain', 'Domain')}</th>
          <th aria-sort={ariaSort('assignments')} className={cn(head, 'min-w-[200px]')} title="Dự án user làm PM/SM (và các component được thu hẹp)">{sortable('assignments', 'Phân quyền')}</th>
          <th aria-sort={ariaSort('view')} className={cn(head, 'min-w-[240px]')} title="Dự án / component được cấp thêm quyền xem trong Quản trị Epic, và 10 Epic ngẫu nhiên trong quyền xem đó (sắp xếp theo số Epic xem được)">{sortable('view', 'Quyền xem')}</th>
          <th aria-sort={ariaSort('loginCount')} className={cn(head, 'text-center')} title="Số lượt đăng nhập (cộng dồn theo ngày, như cột Đăng nhập của danh sách user)">{sortable('loginCount', 'Đăng nhập')}</th>
          <th aria-sort={ariaSort('lastLoginAt')} className={head}>{sortable('lastLoginAt', 'Lần đăng nhập gần nhất')}</th>
          <th aria-sort={ariaSort('tokens')} className="whitespace-nowrap px-2 py-1.5 text-center" title="Số MCP token cá nhân chưa thu hồi">{sortable('tokens', 'Token đang dùng')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-fb-border">
        {rows.map((row, index) => <tr className="hover:bg-fb-surface-muted" key={row.id}>
          <td className={cn(cell, 'text-center font-mono text-fb-text-placeholder')}>{offset + index + 1}</td>
          <td className={cn(cell, 'font-mono font-bold text-black')}>{row.username}{!row.isActive && <span className="ml-1 font-normal text-fb-text-placeholder">(inactive)</span>}</td>
          <td className={cell}>{row.fullName}</td>
          <td className={cn(cell, 'whitespace-nowrap font-semibold')}>{row.role}</td>
          <td className={cell}>{row.domains.length ? row.domains.join(', ') : '-'}</td>
          <td className={cell}><GrantList grants={row.assignments} /></td>
          <td className={cell}>{roleUsesViewGrants(row.role)
            ? <ViewGrantCell row={row} />
            : <span className="text-fb-text-secondary">Xem mọi Epic (theo role)</span>}</td>
          <td className={cn(cell, 'text-center font-mono')}>{row.loginCount}</td>
          <td className={cn(cell, 'whitespace-nowrap font-mono')}>{row.lastLoginAt ? formatCommentStamp(row.lastLoginAt) : '-'}</td>
          <td className="px-2 py-1.5 text-center align-top font-mono">{row.activeTokenCount}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/** Identity fields — used both flat (Create popup) and inside the "Thông tin user" tab (Edit popup). */
function UserIdentityFields({ domains, onChange, user, withPassword = false }: { domains: { value: string; label: string }[]; onChange: (user: UserInput) => void; user: UserInput; withPassword?: boolean }) {
  return <>
    <Input helperText="Nhập username (tự động gắn @mbbank.com.vn) hoặc email đầy đủ; username phải là duy nhất." label="Username / Email" onChange={(event) => onChange({ ...user, email: event.target.value })} required type="text" value={user.email} />
    <Input label="Họ tên" onChange={(event) => onChange({ ...user, fullName: event.target.value })} required value={user.fullName} />
    {withPassword && <Input label="Mật khẩu" minLength={8} onChange={(event) => onChange({ ...user, password: event.target.value })} required type="password" value={user.password ?? ''} />}
    <MultiSelect helperText={user.isActive ? 'User active phải có ít nhất một Domain.' : 'User inactive có thể chưa được gán Domain.'} label="Domain" onChange={(domainIds) => onChange({ ...user, domainIds: domainIds.map(Number) })} options={domains} placeholder="Chọn Domain" required={user.isActive} value={user.domainIds.map(String)} />
  </>;
}

/** Dự án + Component narrowing + Role — used both flat (Create popup) and inside the "Phân quyền" tab (Edit popup). */
function UserPermissionFields({ allProjectComponents, allProjects, currentUserRole, onChange, projects, user }: { allProjectComponents: ProjectComponent[]; allProjects: Project[]; currentUserRole: UserRole | null; onChange: (user: UserInput) => void; projects: { value: string; label: string }[]; user: UserInput }) {
  // Chỉ hiện các role mà actor hiện tại được phép gán (xem canGrantRole); role hiện tại của user
  // vẫn được hiện trong danh sách (dù actor không gán được) để không mất giá trị đang chọn, nhưng
  // Select bị khóa trong trường hợp đó — khớp với rule chặn ở server (/api/users).
  const grantableRoles = currentUserRole ? USER_ROLES.filter((role) => canGrantRole(currentUserRole, role)) : [];
  const roleOptions = USER_ROLES.filter((role) => grantableRoles.includes(role) || role === user.role).map((value) => ({ value, label: value }));
  const roleLocked = !grantableRoles.includes(user.role);
  return <>
    <ProjectComponentFields
      allProjectComponents={allProjectComponents}
      allProjects={allProjects}
      helperText="Tùy chọn. Chọn các dự án user được phân công vai trò PM/SM."
      onChange={(projectIds, projectComponents) => onChange({ ...user, projectComponents, projectIds })}
      projectComponents={user.projectComponents}
      projectIds={user.projectIds}
      projects={projects}
    />
    <Select disabled={roleLocked} helperText={roleLocked ? 'Bạn không có quyền gán hoặc thay đổi role này.' : undefined} label="Role" onChange={(event) => onChange({ ...user, role: event.target.value as UserRole })} options={roleOptions} value={user.role} />
  </>;
}

/** Flat single-form layout — only used by the Create popup (the Edit popup composes the same pieces across tabs). */
function UserForm({ allProjectComponents, allProjects, currentUserRole, domains, onChange, projects, user, withPassword = false }: { allProjectComponents: ProjectComponent[]; allProjects: Project[]; currentUserRole: UserRole | null; domains: { value: string; label: string }[]; onChange: (user: UserInput) => void; projects: { value: string; label: string }[]; user: UserInput; withPassword?: boolean }) {
  return <div className="ui-form flex flex-col gap-4">
    <UserIdentityFields domains={domains} onChange={onChange} user={user} withPassword={withPassword} />
    <UserPermissionFields allProjectComponents={allProjectComponents} allProjects={allProjects} currentUserRole={currentUserRole} onChange={onChange} projects={projects} user={user} />
    <label className="ui-check"><input checked={user.isActive} onChange={(event) => onChange({ ...user, isActive: event.target.checked })} type="checkbox" />Đang hoạt động (Active)</label>
  </div>;
}
