'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowsClockwise, CheckCircle, Key, LockKey, Pulse, ShieldCheck, SignOut, UserCheck, Warning } from '@phosphor-icons/react';

function SsoDemoContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code') || '';
  const errorParam = searchParams.get('error') || '';

  const [apiKey, setApiKey] = React.useState('');
  const [availableKeys, setAvailableKeys] = React.useState<Array<{ apiKey: string; appName: string; keyName: string }>>([]);
  const [loadingKeys, setLoadingKeys] = React.useState(true);

  const [exchanging, setExchanging] = React.useState(false);
  const [exchangeError, setExchangeError] = React.useState<string | null>(null);
  const [ssoResult, setSsoResult] = React.useState<{
    accessToken: string;
    appName: string;
    user: { email: string; fullName: string; id: number; role: string };
  } | null>(null);

  // Fetch API keys for easy testing selection
  React.useEffect(() => {
    async function loadKeys() {
      try {
        const res = await fetch('/api/admin/api-keys');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const active = data.filter((k: any) => k.isActive);
            setAvailableKeys(active);
            if (active.length > 0) {
              setApiKey(active[0].apiKey);
            }
          }
        }
      } catch (err) {
        // Fallback
      } finally {
        setLoadingKeys(false);
      }
    }
    loadKeys();
  }, []);

  // Handle incoming authorization code from SSO redirect
  React.useEffect(() => {
    if (!code) return;

    // Retrieve stored test API Key from localStorage if available
    const savedKey = localStorage.getItem('sso_demo_api_key') || apiKey;
    if (!savedKey) {
      setExchangeError('Không tìm thấy API Key để trao đổi mã code. Vui lòng nhập API Key và thử lại.');
      return;
    }

    async function processCode() {
      setExchanging(true);
      setExchangeError(null);
      try {
        const res = await fetch('/api/sso-demo/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, apiKey: savedKey }),
        });

        const data = await res.json();
        if (!data.success) {
          setExchangeError(`Lỗi trao đổi Token: ${data.error || 'Mã code không hợp lệ hoặc đã hết hạn'}`);
        } else {
          setSsoResult(data);
        }
      } catch (err: any) {
        setExchangeError(err?.message || 'Không thể trao đổi mã token.');
      } finally {
        setExchanging(false);
      }
    }

    processCode();
  }, [code]);

  const handleStartSso = () => {
    if (!apiKey.trim()) {
      alert('Vui lòng chọn hoặc nhập 1 API Key hợp lệ để test SSO!');
      return;
    }

    localStorage.setItem('sso_demo_api_key', apiKey.trim());

    const redirectUri = `${window.location.origin}/sso-demo`;
    const ssoAuthorizeUrl = `/sso/authorize?client_id=${encodeURIComponent(apiKey.trim())}&redirect_uri=${encodeURIComponent(redirectUri)}&state=demo_test_${Date.now()}`;

    window.location.href = ssoAuthorizeUrl;
  };

  const handleResetDemo = () => {
    localStorage.removeItem('sso_demo_api_key');
    setSsoResult(null);
    setExchangeError(null);
    window.history.replaceState({}, '', '/sso-demo');
  };

  return (
    <div className="min-h-screen bg-fb-bg text-fb-text-primary p-6 md:p-12">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Page Banner */}
        <div className="rounded-2xl border border-fb-border bg-fb-surface p-6 shadow-sm flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-fb-blue-soft text-fb-blue">
            <LockKey className="size-6" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-fb-text-primary">Demo SSO Authentication Client</h1>
              <span className="rounded-full bg-fb-blue/10 px-2.5 py-0.5 text-xs font-bold text-fb-blue">Ứng dụng B (Mô phỏng)</span>
            </div>
            <p className="mt-1 text-sm text-fb-text-secondary">
              Trang web thử nghiệm này giả lập <strong>Ứng dụng B ở một domain khác</strong> thực hiện luồng đăng nhập tập trung (SSO Authorization Code Flow) thông qua <code className="text-fb-blue font-bold">ttm-tool</code>.
            </p>
          </div>
        </div>

        {/* Step Status Card */}
        {exchanging ? (
          <div className="rounded-2xl border border-fb-blue/30 bg-fb-blue-soft/30 p-8 text-center space-y-3">
            <div className="mx-auto size-10 animate-spin rounded-full border-4 border-fb-blue border-t-transparent" />
            <h3 className="text-base font-bold text-fb-text-primary">Đang nhận mã Authorization Code & Trao đổi lấy Token...</h3>
            <p className="text-xs font-mono text-fb-text-secondary break-all">Code: {code}</p>
          </div>
        ) : ssoResult ? (
          /* SUCCESS STATE */
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="size-8 text-emerald-500" weight="fill" />
                <div>
                  <h2 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Xác thực SSO thành công 100%!</h2>
                  <p className="text-xs text-fb-text-secondary">Ứng dụng B đã nhận thông tin User an toàn từ ttm-tool.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetDemo}
                className="flex items-center gap-1.5 rounded-lg border border-fb-border bg-fb-surface px-3 py-1.5 text-xs font-bold text-fb-text-primary hover:bg-fb-control"
              >
                <SignOut className="size-4" weight="bold" />
                <span>Thử lại / Đăng xuất</span>
              </button>
            </div>

            {/* Profile Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-fb-border bg-fb-surface p-4 space-y-2">
                <p className="text-xs font-bold uppercase text-sidebar-muted">Thông tin Người dùng (User Profile)</p>
                <div className="space-y-1 text-sm">
                  <p><span className="text-fb-text-secondary">Họ và tên:</span> <strong className="text-fb-text-primary">{ssoResult.user.fullName}</strong></p>
                  <p><span className="text-fb-text-secondary">Email:</span> <strong className="text-fb-blue font-mono">{ssoResult.user.email}</strong></p>
                  <p><span className="text-fb-text-secondary">User ID:</span> <span className="font-mono">{ssoResult.user.id}</span></p>
                  <p><span className="text-fb-text-secondary">Quyền (Role):</span> <span className="inline-block rounded bg-fb-blue-soft px-2 py-0.5 text-xs font-bold text-fb-blue">{ssoResult.user.role}</span></p>
                </div>
              </div>

              <div className="rounded-xl border border-fb-border bg-fb-surface p-4 space-y-2">
                <p className="text-xs font-bold uppercase text-sidebar-muted">Thông tin Kết nối (Token Info)</p>
                <div className="space-y-1 text-sm">
                  <p><span className="text-fb-text-secondary">Ứng dụng xác nhận:</span> <strong className="text-fb-text-primary">{ssoResult.appName}</strong></p>
                  <p><span className="text-fb-text-secondary">Access Token:</span></p>
                  <p className="font-mono text-xs text-sidebar-muted bg-fb-surface-muted p-2 rounded border border-fb-border break-all">{ssoResult.accessToken}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* CONFIG & START STATE */
          <div className="rounded-2xl border border-fb-border bg-fb-surface p-6 shadow-sm space-y-6">
            <h2 className="text-base font-bold text-fb-text-primary flex items-center gap-2">
              <Key className="size-5 text-fb-blue" weight="bold" />
              <span>Bước 1: Chọn API Key của Ứng dụng B</span>
            </h2>

            {exchangeError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-semibold text-red-500 flex items-center gap-2">
                <Warning className="size-5 shrink-0" weight="bold" />
                <span>{exchangeError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-fb-text-primary">API Key (client_id)</label>
                {loadingKeys ? (
                  <p className="text-xs text-sidebar-muted">Đang tải danh sách API Key...</p>
                ) : availableKeys.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full rounded-xl border border-fb-border bg-fb-surface px-3 py-2.5 text-sm outline-none focus:border-fb-blue"
                    >
                      {availableKeys.map((k) => (
                        <option key={k.apiKey} value={k.apiKey}>
                          {k.appName} ({k.keyName}) — {k.apiKey}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-sidebar-muted">Bạn có thể chọn API Key sẵn có ở trên hoặc nhập thủ công bên dưới.</p>
                  </div>
                ) : null}

                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Dán mã API Key dạng ttm_ak_..."
                  className="mt-2 w-full rounded-xl border border-fb-border bg-fb-surface px-3.5 py-2.5 text-sm font-mono outline-none focus:border-fb-blue"
                />
              </div>

              <div className="rounded-xl border border-fb-border bg-fb-surface-muted p-4 text-xs space-y-1 text-fb-text-secondary">
                <p className="font-bold text-fb-text-primary">Luồng xử lý khi bấm nút phía dưới:</p>
                <p>1. Redirect trình duyệt sang: <code className="text-fb-blue">/sso/authorize?client_id=...&redirect_uri=.../sso-demo</code></p>
                <p>2. Người dùng xác thực tại màn hình SSO của ttm-tool.</p>
                <p>3. ttm-tool redirect ngược lại <code className="text-fb-blue">/sso-demo?code=ttm_ac_...</code></p>
                <p>4. Ứng dụng B gọi API <code className="text-fb-blue">POST /api/sso/token</code> để nhận thông tin User Profile.</p>
              </div>

              <button
                type="button"
                onClick={handleStartSso}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-fb-primary py-3.5 text-sm font-bold text-fb-on-primary shadow-sm transition-all hover:opacity-90"
              >
                <ShieldCheck className="size-5" weight="fill" />
                <span>Bắt đầu Đăng nhập bằng TTM Account (SSO)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SsoDemoPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-fb-bg text-fb-text-primary p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="size-10 animate-spin rounded-full border-4 border-fb-blue border-t-transparent" />
            <p className="text-sm font-medium text-fb-text-secondary">Đang tải trang SSO Demo...</p>
          </div>
        </div>
      }
    >
      <SsoDemoContent />
    </React.Suspense>
  );
}
