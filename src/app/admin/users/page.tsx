'use client';

import { useEffect, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { DataTableToolbar } from '@/components/ui/DataTableToolbar';
import { TableAction } from '@/components/ui/TableAction';
import { USER_ROLES } from '@/lib/auth-types';
import { fuzzyIncludes } from '@/lib/fuzzy-search';
import type { ManagedUser, UserInput, UserRole } from '@/lib/auth-types';
import type { Domain, Project } from '@/lib/master-data-types';

type Tab = 'users' | 'reset' | 'registrations';
type Ticket = { id: number; email: string; userId: number | null; createdAt: string };
type BulkDelete = { ids: number[]; type: 'registrations' | 'tickets' };

const emptyUser = (): UserInput => ({ email: '', fullName: '', role: 'USER', isActive: true, password: '', domainIds: [], projectIds: [] });
const randomPassword = () => `${crypto.randomUUID().slice(0, 8)}Aa!`;

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
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

  const load = async () => {
    const [usersResponse, ticketsResponse, domainsResponse, projectsResponse] = await Promise.all([fetch('/api/users'), fetch('/api/password-reset-requests'), fetch('/api/domains'), fetch('/api/projects')]);
    if (usersResponse.ok) setUsers(await usersResponse.json());
    if (ticketsResponse.ok) setTickets(await ticketsResponse.json());
    if (domainsResponse.ok) setDomains((await domainsResponse.json()).filter((domain: Domain) => domain.isActive));
    if (projectsResponse.ok) setProjects(await projectsResponse.json());
  };

  useEffect(() => { void Promise.resolve().then(load); }, []);
  const domainOptions = [{ value: '', label: 'Chọn Domain' }, ...domains.map((domain) => ({ value: String(domain.id), label: `${domain.domainCode} — ${domain.domainName}` }))];
  const domainMultiOptions = domains.map((domain) => ({ value: String(domain.id), label: `${domain.domainCode} — ${domain.domainName}` }));
  const projectMultiOptions = projects.map((project) => ({ value: String(project.id), label: `${project.projectKey} — ${project.projectName}${project.isActive ? '' : ' (Inactive)'}` }));
  const inactiveUsers = users.filter((user) => !user.isActive);
  const domainName = (user: ManagedUser) => user.domainIds.map((domainId) => domains.find((domain) => domain.id === domainId)?.domainName).filter((name): name is string => Boolean(name)).join(', ') || '-';
  const toggle = (id: number, checked: boolean, selected: number[], setSelected: (ids: number[]) => void) => setSelected(checked ? [...selected, id] : selected.filter((value) => value !== id));
  const visibleUsers = users.filter((user) => fuzzyIncludes(searchTerm, [user.email, user.fullName, domainName(user), user.role, user.isActive ? 'active' : 'inactive']));
  const visibleTickets = tickets.filter((ticket) => fuzzyIncludes(searchTerm, [ticket.email, ticket.createdAt]));
  const visibleInactiveUsers = inactiveUsers.filter((user) => fuzzyIncludes(searchTerm, [user.email, user.fullName, domainName(user)]));

  const save = async () => {
    if (!editing) return;
    if (editing.isActive && editing.domainIds.length === 0) { setMessage({ text: 'User active phải thuộc ít nhất một Domain.', type: 'error' }); return; }
    const response = await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    const result = await response.json();
    if (response.ok) { setEditing(null); setMessage({ text: 'Đã cập nhật user.', type: 'success' }); void load(); }
    else setMessage({ text: result.error || 'Không thể cập nhật user.', type: 'error' });
  };

  const create = async () => {
    if (createForm.isActive && createForm.domainIds.length === 0) { setMessage({ text: 'User active phải thuộc ít nhất một Domain.', type: 'error' }); return; }
    const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createForm) });
    const result = await response.json();
    if (response.ok) { setCreating(false); setMessage({ text: 'Đã tạo user.', type: 'success' }); void load(); }
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
      setMessage({ text: `Đã thêm ${result.created.length} user inactive${result.skipped.length ? `; bỏ qua ${result.skipped.length} user đã tồn tại` : ''}.`, type: 'success' });
      void load();
    } catch { setMessage({ text: 'Không thể kết nối API.', type: 'error' }); } finally { setIsBulkSaving(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    const response = await fetch(`/api/users?id=${deleting.id}`, { method: 'DELETE' });
    const result = await response.json();
    if (response.ok) { setDeleting(null); setEditing(null); setMessage({ text: 'Đã xóa user.', type: 'success' }); void load(); }
    else setMessage({ text: result.error || 'Không thể xóa user.', type: 'error' });
  };

  const reset = async () => {
    if (resetTickets.length === 0) return;
    const response = await fetch('/api/password-reset-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tickets: resetTickets.map(({ id, userId }) => ({ id, userId })), password }) });
    const result = await response.json();
    if (response.ok) { const count = resetTickets.length; setResetTickets([]); setSelectedTicketIds([]); setMessage({ text: `Đã cấp lại mật khẩu cho ${count} user.`, type: 'success' }); void load(); }
    else setMessage({ text: result.error || 'Không thể cấp lại mật khẩu.', type: 'error' });
  };

  const approve = async (ids: number[], domainId?: number) => {
    const response = await fetch('/api/users/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, ...(domainId ? { domainId } : {}) }) });
    const result = await response.json();
    if (response.ok) { setApprovalUserIds([]); setApprovalDomainId(''); setSelectedRegistrationIds([]); setMessage({ text: `Đã duyệt ${result.approved} đăng ký mới${result.domainAssigned ? ` và gán Domain cho ${result.domainAssigned} user` : ''}.`, type: 'success' }); void load(); }
    else setMessage({ text: result.error || 'Không thể duyệt đăng ký.', type: 'error' });
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
      : await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: bulkDelete.ids }) });
    const result = await response.json();
    if (response.ok) { const count = typeof result.deleted === 'number' ? result.deleted : bulkDelete.ids.length; setMessage({ text: `Đã xóa ${count} yêu cầu.`, type: 'success' }); if (bulkDelete.type === 'tickets') setSelectedTicketIds([]); else setSelectedRegistrationIds([]); setBulkDelete(null); void load(); }
    else setMessage({ text: result.error || 'Không thể xóa các mục đã chọn.', type: 'error' });
  };

  return <div className="flex flex-col gap-6">
    <nav className="ui-tabs" aria-label="Quản lý user">{([['users', 'Quản lý user', 0], ['reset', 'Yêu cầu cấp lại mật khẩu', tickets.length], ['registrations', 'Duyệt đăng ký mới', inactiveUsers.length]] as [Tab, string, number][]).map(([key, label, count]) => <Button key={key} onClick={() => setTab(key)} variant={tab === key ? 'primary' : 'outline'}><span>{label}</span>{count > 0 && <Badge className="ml-1" variant={key === 'reset' ? 'warning' : 'info'}>{count}</Badge>}</Button>)}</nav>
    {message && <Alert title={message.type === 'success' ? 'Thông báo' : 'Lỗi'} variant={message.type}>{message.text}</Alert>}
    <Card><CardHeader><CardTitle>{tab === 'users' ? 'Quản lý user' : tab === 'reset' ? 'Yêu cầu cấp lại mật khẩu' : 'Duyệt đăng ký mới'}</CardTitle>
      {tab === 'users' && <div className="flex gap-2"><Button size="sm" onClick={() => { setBulkUsernames(''); setCreatingBulk(true); }} variant="outline">Thêm nhiều user</Button><Button size="sm" icon={<Plus className="size-4" weight="bold" />} onClick={() => { setCreateForm(emptyUser()); setCreating(true); }}>Thêm user</Button></div>}
      {tab === 'reset' && selectedTicketIds.length > 0 && <div className="ui-button-group flex gap-2"><Button onClick={() => setBulkDelete({ ids: selectedTicketIds, type: 'tickets' })} size="sm" variant="danger">Xóa ({selectedTicketIds.length})</Button><Button onClick={() => { const selected = tickets.filter((ticket) => selectedTicketIds.includes(ticket.id) && ticket.userId !== null); setResetTickets(selected); setPassword(randomPassword()); }} size="sm">Cấp lại mật khẩu ({selectedTicketIds.length})</Button></div>}
      {tab === 'registrations' && selectedRegistrationIds.length > 0 && <div className="ui-button-group flex gap-2"><Button onClick={() => setBulkDelete({ ids: selectedRegistrationIds, type: 'registrations' })} size="sm" variant="danger">Xóa ({selectedRegistrationIds.length})</Button><Button onClick={() => requestApproval(inactiveUsers.filter((user) => selectedRegistrationIds.includes(user.id)))} size="sm">Duyệt đăng ký ({selectedRegistrationIds.length})</Button></div>}
    </CardHeader><CardBody>
      <DataTableToolbar onReset={() => setSearchTerm('')} onSearchChange={setSearchTerm} placeholder={tab === 'users' ? 'Tìm email, họ tên, Domain hoặc role' : tab === 'reset' ? 'Tìm email hoặc thời gian gửi' : 'Tìm email, họ tên hoặc Domain'} searchValue={searchTerm} />
      {tab === 'users' && (visibleUsers.length ? <TableContainer><Table><THead><TR><TH>Email</TH><TH>Họ tên</TH><TH>Domain</TH><TH>Role</TH><TH>Trạng thái</TH><TH>Hành động</TH></TR></THead><TBody>{visibleUsers.map((user) => <TR key={user.id}><TD>{user.email}</TD><TD>{user.fullName}</TD><TD>{domainName(user)}</TD><TD><Badge variant="info">{user.role}</Badge></TD><TD><Badge variant={user.isActive ? 'success' : 'neutral'}>{user.isActive ? 'Active' : 'Inactive'}</Badge></TD><TD><TableAction onClick={() => setEditing({ ...user })} variant="info">Chỉnh sửa</TableAction></TD></TR>)}</TBody></Table></TableContainer> : <p className="text-fb-text-secondary">Không tìm thấy user phù hợp.</p>)}
      {tab === 'reset' && (tickets.length ? (visibleTickets.length ? <TableContainer><Table><THead><TR><TH className="text-center"><input aria-label="Chọn tất cả yêu cầu cấp lại mật khẩu" checked={visibleTickets.length > 0 && visibleTickets.every((ticket) => selectedTicketIds.includes(ticket.id))} onChange={(event) => setSelectedTicketIds(event.target.checked ? [...new Set([...selectedTicketIds, ...visibleTickets.map((ticket) => ticket.id)])] : selectedTicketIds.filter((id) => !visibleTickets.some((ticket) => ticket.id === id)))} type="checkbox" /></TH><TH>Email</TH><TH>Thời gian gửi</TH><TH>Hành động</TH></TR></THead><TBody>{visibleTickets.map((ticket) => <TR key={ticket.id}><TD className="text-center"><input aria-label={`Chọn yêu cầu của ${ticket.email}`} checked={selectedTicketIds.includes(ticket.id)} onChange={(event) => toggle(ticket.id, event.target.checked, selectedTicketIds, setSelectedTicketIds)} type="checkbox" /></TD><TD>{ticket.email}</TD><TD>{ticket.createdAt}</TD><TD>{ticket.userId ? <TableAction onClick={() => { setResetTickets([ticket]); setPassword(randomPassword()); }} variant="warning">Cấp lại</TableAction> : 'Không tìm thấy user'}</TD></TR>)}</TBody></Table></TableContainer> : <p className="text-fb-text-secondary">Không tìm thấy ticket phù hợp.</p>) : <p className="text-fb-text-secondary">Không có ticket đang chờ.</p>)}
      {tab === 'registrations' && (visibleInactiveUsers.length ? <TableContainer><Table><THead><TR><TH className="text-center"><input aria-label="Chọn tất cả đăng ký mới" checked={visibleInactiveUsers.length > 0 && visibleInactiveUsers.every((user) => selectedRegistrationIds.includes(user.id))} onChange={(event) => setSelectedRegistrationIds(event.target.checked ? [...new Set([...selectedRegistrationIds, ...visibleInactiveUsers.map((user) => user.id)])] : selectedRegistrationIds.filter((id) => !visibleInactiveUsers.some((user) => user.id === id)))} type="checkbox" /></TH><TH>Email</TH><TH>Họ tên</TH><TH>Domain</TH><TH>Hành động</TH></TR></THead><TBody>{visibleInactiveUsers.map((user) => <TR key={user.id}><TD className="text-center"><input aria-label={`Chọn đăng ký của ${user.email}`} checked={selectedRegistrationIds.includes(user.id)} onChange={(event) => toggle(user.id, event.target.checked, selectedRegistrationIds, setSelectedRegistrationIds)} type="checkbox" /></TD><TD>{user.email}</TD><TD>{user.fullName}</TD><TD>{domainName(user)}</TD><TD><TableAction onClick={() => requestApproval([user])} variant="info">Duyệt</TableAction></TD></TR>)}</TBody></Table></TableContainer> : <p className="text-fb-text-secondary">Không tìm thấy đăng ký phù hợp.</p>)}
    </CardBody></Card>
    <Modal isOpen={creating} onClose={() => setCreating(false)} title="Thêm user mới" footer={<><Button onClick={() => setCreating(false)} variant="outline">Hủy</Button><Button onClick={create}>Lưu</Button></>}><UserForm domains={domainMultiOptions} onChange={setCreateForm} projects={projectMultiOptions} user={createForm} withPassword /></Modal>
    <Modal isOpen={creatingBulk} onClose={() => setCreatingBulk(false)} title="Thêm nhiều user" footer={<><Button onClick={() => setCreatingBulk(false)} variant="outline">Hủy</Button><Button isLoading={isBulkSaving} onClick={createBulkUsers}>Thêm user</Button></>}><div className="ui-form flex flex-col gap-4"><FormField id="bulk-usernames" label="Danh sách username" helperText="Nhập username, ngăn cách bằng dấu phẩy; không cần @mbbank.com.vn."><textarea className="ui-textarea form-control-compact" onChange={(event) => setBulkUsernames(event.target.value)} placeholder="minhnd7, ngothanhha, congha" value={bulkUsernames} /></FormField><p className="text-fb-text-secondary">User mới có Họ tên là username, email dạng username@mbbank.com.vn, role USER, inactive, chưa gán Domain và mật khẩu mặc định theo cấu hình yêu cầu.</p></div></Modal>
    <Modal isOpen={approvalUserIds.length > 0} onClose={() => setApprovalUserIds([])} title="Chọn Domain để duyệt đăng ký" footer={<><Button onClick={() => setApprovalUserIds([])} variant="outline">Hủy</Button><Button disabled={!approvalDomainId} onClick={() => void approve(approvalUserIds, Number(approvalDomainId))}>Duyệt đăng ký</Button></>}><div className="ui-form flex flex-col gap-4"><p className="text-fb-text-secondary">Các user được chọn chưa có Domain. Chọn một Domain active để gán trước khi kích hoạt {approvalUserIds.length} user.</p><Select label="Domain" onChange={(event) => setApprovalDomainId(event.target.value)} options={domainOptions} required value={approvalDomainId} /></div></Modal>
    <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Chỉnh sửa user" footer={<><Button onClick={() => setDeleting(editing)} title="Xóa user" variant="danger">Xóa user</Button><Button onClick={save}>Lưu</Button></>}>{editing && <UserForm domains={domainMultiOptions} onChange={(user) => setEditing(user as ManagedUser)} projects={projectMultiOptions} user={editing} />}</Modal>
    <Modal isOpen={resetTickets.length > 0} onClose={() => setResetTickets([])} title="Cấp lại mật khẩu" footer={<><Button onClick={() => setPassword(randomPassword())} variant="outline">Tạo ngẫu nhiên</Button><Button onClick={reset}>Lưu</Button></>}><div className="flex flex-col gap-4"><p className="text-fb-text-secondary">Mật khẩu mới sẽ áp dụng cho {resetTickets.length} user đã chọn.</p><Input label="Mật khẩu mới" minLength={8} onChange={(event) => setPassword(event.target.value)} value={password} /></div></Modal>
    <ConfirmDialog confirmLabel="Xóa user" description={`Bạn có chắc muốn xóa user ${deleting?.email ?? ''}?`} isOpen={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} steps={1} title="Xóa user" />
    <ConfirmDialog confirmLabel="Xóa" description={`Bạn có chắc muốn xóa ${bulkDelete?.ids.length ?? 0} ${bulkDelete?.type === 'tickets' ? 'yêu cầu cấp lại mật khẩu' : 'yêu cầu đăng ký mới'} đã chọn?`} isOpen={bulkDelete !== null} onClose={() => setBulkDelete(null)} onConfirm={deleteSelected} steps={1} title="Xóa các mục đã chọn" />
  </div>;
}

function UserForm({ domains, onChange, projects, user, withPassword = false }: { domains: { value: string; label: string }[]; onChange: (user: UserInput) => void; projects: { value: string; label: string }[]; user: UserInput; withPassword?: boolean }) {
  return <div className="ui-form flex flex-col gap-4"><Input label="Email" onChange={(event) => onChange({ ...user, email: event.target.value })} required type="email" value={user.email} /><Input label="Họ tên" onChange={(event) => onChange({ ...user, fullName: event.target.value })} required value={user.fullName} />{withPassword && <Input label="Mật khẩu" minLength={8} onChange={(event) => onChange({ ...user, password: event.target.value })} required type="password" value={user.password ?? ''} />}<MultiSelect helperText={user.isActive ? 'User active phải có ít nhất một Domain.' : 'User inactive có thể chưa được gán Domain.'} label="Domain" onChange={(domainIds) => onChange({ ...user, domainIds: domainIds.map(Number) })} options={domains} placeholder="Chọn Domain" required={user.isActive} value={user.domainIds.map(String)} /><MultiSelect helperText="Tùy chọn. Chọn các dự án user được phân công vai trò PM/SM." label="Dự án" onChange={(projectIds) => onChange({ ...user, projectIds: projectIds.map(Number) })} options={projects} placeholder="Chọn dự án" value={user.projectIds.map(String)} /><Select label="Role" onChange={(event) => onChange({ ...user, role: event.target.value as UserRole })} options={USER_ROLES.map((value) => ({ value, label: value }))} value={user.role} /><label className="ui-check"><input checked={user.isActive} onChange={(event) => onChange({ ...user, isActive: event.target.checked })} type="checkbox" />Đang hoạt động (Active)</label></div>;
}
