'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Key, Lock, Pulse, ShieldCheck, User, Warning } from '@phosphor-icons/react';

function SsoAuthorizeContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id') || searchParams.get('clientId') || '';
  const redirectUri = searchParams.get('redirect_uri') || searchParams.get('redirectUri') || '';
  const state = searchParams.get('state') || '';

  const [loadingClient, setLoadingClient] = React.useState(true);
  const [clientInfo, setClientInfo] = React.useState<{ appName: string; keyName: string } | null>(null);
  const [clientError, setClientError] = React.useState<string | null>(null);

  const [currentUser, setCurrentUser] = React.useState<{ email: string; fullName: string; id: number } | null>(null);
  const [useOtherAccount, setUseOtherAccount] = React.useState(false);

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function init() {
      if (!clientId) {
        setClientError('Thiếu tham số client_id (API Key) trên đường dẫn.');
        setLoadingClient(false);
        return;
      }
      if (!redirectUri) {
        setClientError('Thiếu tham số redirect_uri trên đường dẫn.');
        setLoadingClient(false);
        return;
      }

      try {
        const [clientRes, meRes] = await Promise.all([
          fetch(`/api/sso/verify-client?client_id=${encodeURIComponent(clientId)}`),
          fetch('/api/auth/me'),
        ]);

        const clientData = await clientRes.json();
        if (!clientData.success) {
          setClientError(clientData.error || 'Client ID không hợp lệ.');
        } else {
          setClientInfo(clientData.client);
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData?.user) {
            setCurrentUser(meData.user);
          }
        }
      } catch (err: any) {
        setClientError(err?.message || 'Không thể kết nối máy chủ xác thực.');
      } finally {
        setLoadingClient(false);
      }
    }

    init();
  }, [clientId, redirectUri]);

  const handleAuthorizeCurrentSession = async () => {
    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/sso/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          redirectUri,
          state,
          confirmExistingSession: true,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setAuthError(data.error || 'Ủy quyền thất bại.');
        setSubmitting(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setAuthError(err?.message || 'Lỗi kết nối.');
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setAuthError('Vui lòng điền đầy đủ Tên đăng nhập và Mật khẩu.');
      return;
    }

    setSubmitting(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/sso/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          redirectUri,
          state,
          username,
          password,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setAuthError(data.error || 'Đăng nhập thất bại.');
        setSubmitting(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (err: any) {
      setAuthError(err?.message || 'Lỗi hệ thống.');
      setSubmitting(false);
    }
  };

  if (loadingClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fb-bg text-fb-text-primary p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-spin rounded-full border-4 border-fb-blue border-t-transparent" />
          <p className="text-sm font-medium text-fb-text-secondary">Đang kiểm tra thông tin ứng dụng kết nối...</p>
        </div>
      </div>
    );
  }

  if (clientError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fb-bg text-fb-text-primary p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-fb-surface p-6 shadow-xl text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-red-500/10 text-red-500">
            <Warning className="size-6" weight="bold" />
          </div>
          <h2 className="text-lg font-bold text-fb-text-primary mb-2">Yêu cầu Đăng nhập Không Hợp lệ</h2>
          <p className="text-sm text-fb-text-secondary mb-6">{clientError}</p>
          <div className="text-xs text-sidebar-muted bg-fb-surface-muted p-3 rounded-lg text-left font-mono break-all space-y-1">
            <p><strong>client_id:</strong> {clientId || '(Trống)'}</p>
            <p><strong>redirect_uri:</strong> {redirectUri || '(Trống)'}</p>
          </div>
        </div>
      </div>
    );
  }

  const showExistingSessionPrompt = currentUser && !useOtherAccount;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-fb-bg to-fb-surface-muted p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-fb-border bg-fb-surface shadow-dialog">
        {/* Header */}
        <div className="border-b border-fb-border bg-fb-surface-muted p-6 text-center">
          <div className="mx-auto mb-3 flex items-center justify-center gap-2">
            <div className="grid size-10 place-items-center rounded-xl bg-fb-primary text-fb-on-primary shadow-sm">
              <Pulse className="size-6" weight="bold" />
            </div>
            <div className="text-left">
              <h1 className="text-base font-extrabold tracking-tight text-fb-text-primary">TTM Account SSO</h1>
              <p className="text-[11px] font-semibold text-fb-blue">Đăng nhập tập trung</p>
            </div>
          </div>
          
          <div className="mt-4 rounded-xl border border-fb-blue/20 bg-fb-blue-soft/50 p-3 text-left">
            <p className="text-xs text-fb-text-secondary">Ứng dụng yêu cầu xác thực:</p>
            <p className="text-sm font-bold text-fb-text-primary flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="size-4 text-fb-blue shrink-0" weight="fill" />
              <span className="truncate">{clientInfo?.appName}</span>
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {authError && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs font-semibold text-red-500 flex items-center gap-2">
              <Warning className="size-4 shrink-0" weight="bold" />
              <span>{authError}</span>
            </div>
          )}

          {showExistingSessionPrompt ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-fb-border bg-fb-surface-muted p-4 text-center">
                <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-fb-blue-soft text-fb-blue">
                  <User className="size-6" weight="bold" />
                </div>
                <p className="text-xs text-fb-text-secondary">Bạn đang đăng nhập với tài khoản:</p>
                <p className="text-sm font-bold text-fb-text-primary mt-1">{currentUser.fullName}</p>
                <p className="text-xs font-mono text-fb-blue mt-0.5">{currentUser.email}</p>
              </div>

              <button
                type="button"
                onClick={handleAuthorizeCurrentSession}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-fb-primary py-3 text-sm font-bold text-fb-on-primary transition-all hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Đang xử lý...' : (
                  <>
                    <span>Ủy quyền & Đăng nhập</span>
                    <ArrowRight className="size-4" weight="bold" />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setUseOtherAccount(true)}
                className="w-full text-center text-xs font-semibold text-fb-text-secondary hover:text-fb-blue hover:underline"
              >
                Đăng nhập bằng tài khoản khác
              </button>
            </div>
          ) : (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-fb-text-primary">Tên đăng nhập / Email</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="VD: user.name hoặc user.name@mbbank.com.vn"
                    className="w-full rounded-xl border border-fb-border bg-fb-surface px-3.5 py-2.5 pl-10 text-sm outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue"
                    required
                  />
                  <User className="absolute left-3 top-3 size-4 text-fb-text-secondary" weight="bold" />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-fb-text-primary">Mật khẩu</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full rounded-xl border border-fb-border bg-fb-surface px-3.5 py-2.5 pl-10 text-sm outline-none focus:border-fb-blue focus:ring-1 focus:ring-fb-blue"
                    required
                  />
                  <Lock className="absolute left-3 top-3 size-4 text-fb-text-secondary" weight="bold" />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-fb-primary py-3 text-sm font-bold text-fb-on-primary transition-all hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Đang xác thực...' : (
                  <>
                    <span>Đăng nhập & Cho phép</span>
                    <ArrowRight className="size-4" weight="bold" />
                  </>
                )}
              </button>

              {currentUser && (
                <button
                  type="button"
                  onClick={() => setUseOtherAccount(false)}
                  className="w-full text-center text-xs font-semibold text-fb-text-secondary hover:text-fb-blue hover:underline"
                >
                  Quay lại tài khoản ({currentUser.fullName})
                </button>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-fb-border bg-fb-surface-muted px-6 py-3 text-center text-[11px] text-sidebar-muted flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3.5 text-fb-blue" weight="fill" />
          <span>Xác thực an toàn được bảo vệ bởi TTM Tool SSO Server</span>
        </div>
      </div>
    </div>
  );
}

export default function SsoAuthorizePage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-fb-bg text-fb-text-primary p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="size-10 animate-spin rounded-full border-4 border-fb-blue border-t-transparent" />
            <p className="text-sm font-medium text-fb-text-secondary">Đang tải trang xác thực SSO...</p>
          </div>
        </div>
      }
    >
      <SsoAuthorizeContent />
    </React.Suspense>
  );
}
