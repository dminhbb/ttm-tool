/* eslint-disable @next/next/no-img-element */
'use client';

import { FormEvent, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SystemStatusFooter } from '@/components/layout/SystemStatusFooter';

type ModalMode = 'forgot' | 'register' | null;
type RegistrationDomain = { id: number; domainCode: string; domainName: string };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [mode, setMode] = useState<ModalMode>(null);
  const [image, setImage] = useState<string | undefined>();
  const [captchaId, setCaptchaId] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [domainId, setDomainId] = useState('');
  const [domains, setDomains] = useState<RegistrationDomain[]>([]);
  const [notice, setNotice] = useState('');

  const loadCaptcha = async () => {
    const response = await fetch('/api/auth/captcha', { cache: 'no-store' });
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'id' in data && 'image' in data && typeof data.id === 'string' && typeof data.image === 'string') {
      setCaptchaId(data.id); setImage(data.image); setCaptcha('');
    }
  };

  const loadDomains = async () => {
    const response = await fetch('/api/auth/registration-domains', { cache: 'no-store' });
    if (response.ok) setDomains(await response.json());
  };

  const open = (value: Exclude<ModalMode, null>) => {
    setMode(value); setNotice('');
    void loadCaptcha();
    if (value === 'register') void loadDomains();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, remember }) });
    if (response.ok) { router.replace('/'); router.refresh(); } else setNotice('Sai username hoặc mật khẩu.');
  };

  const send = async () => {
    const body = mode === 'register' ? { email, fullName: name, password: newPassword, domainId: Number(domainId), captcha, captchaId } : { email, captcha, captchaId };
    const response = await fetch(mode === 'register' ? '/api/auth/register' : '/api/password-reset-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data: unknown = await response.json();
    if (!response.ok) {
      setNotice(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'Không thể gửi yêu cầu.');
      void loadCaptcha();
      return;
    }
    setNotice(mode === 'register' ? 'Đăng ký đã gửi, chờ Superadmin duyệt.' : 'Yêu cầu cấp lại mật khẩu đã được gửi.');
  };

  return <main className="grid min-h-[100dvh] place-items-center bg-fb-bg p-4"><Card className="w-full max-w-md"><CardHeader><div><CardTitle>Đăng nhập TTM Monitor</CardTitle><p className="mt-1 text-fb-text-secondary">Phòng QLDA-TKTN, Trung tâm ĐBCL</p></div></CardHeader><CardBody><form className="flex flex-col gap-4" onSubmit={submit}>{notice && <Alert title="Thông báo" variant="info">{notice}</Alert>}<Input label="Username" onChange={(event) => setUsername(event.target.value)} required value={username} /><div className="relative"><Input className="pr-10" label="Mật khẩu" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} value={password} /><button aria-label="Hiện hoặc ẩn mật khẩu" className="absolute right-3 top-9" onClick={() => setShowPassword(!showPassword)} type="button">{showPassword ? <EyeSlash /> : <Eye />}</button></div><label className="ui-check"><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />Ghi nhớ đăng nhập (24 giờ)</label><Button type="submit">Đăng nhập</Button><div className="flex justify-between"><button className="text-fb-blue" onClick={() => open('forgot')} type="button">Quên mật khẩu?</button><button className="text-fb-blue" onClick={() => open('register')} type="button">Đăng ký account</button></div></form></CardBody></Card><Modal isOpen={mode !== null} onClose={() => setMode(null)} title={mode === 'register' ? 'Đăng ký account' : 'Quên mật khẩu'} footer={<><Button onClick={() => setMode(null)} variant="outline">Hủy</Button><Button onClick={send}>Gửi</Button></>}>{notice && <Alert title="Thông báo" variant="info">{notice}</Alert>}<div className="mt-4 flex flex-col gap-4">{mode === 'register' && <><Input label="Họ tên" onChange={(event) => setName(event.target.value)} required value={name} /><Input label="Mật khẩu" minLength={8} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} /><Select label="Domain" onChange={(event) => setDomainId(event.target.value)} options={[{ value: '', label: domains.length ? 'Chọn Domain' : 'Chưa có Domain hoạt động' }, ...domains.map((domain) => ({ value: String(domain.id), label: `${domain.domainCode} — ${domain.domainName}` }))]} required value={domainId} /></>}<Input label="Email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /><div className="flex items-end gap-3">{image ? <img alt="CAPTCHA phân biệt chữ hoa, chữ thường" className="h-[52px] w-[190px] rounded border border-fb-border" src={image} /> : <div aria-label="Đang tải CAPTCHA" className="h-[52px] w-[190px] rounded border border-fb-border bg-fb-surface-muted" />}<Button onClick={() => void loadCaptcha()} type="button" variant="outline">Đổi mã</Button></div><Input label="Nhập mã CAPTCHA" onChange={(event) => setCaptcha(event.target.value)} required value={captcha} /></div></Modal><SystemStatusFooter /></main>;
}
