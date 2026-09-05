'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Eye, EyeSlash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PASSWORD_REQUIREMENTS_GUIDE, validatePassword } from '@/lib/password-rules';

interface ChangePasswordModalProps {
  isForceChangePassword?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isForceChangePassword = false, isOpen, onClose }: ChangePasswordModalProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2 | 'success'>(1);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);

  const [newPassword, setNewPassword] = React.useState('');
  const [showNewPassword, setShowNewPassword] = React.useState(false);

  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    void Promise.resolve().then(() => {
      setStep(1);
      setCurrentPassword('');
      setShowCurrentPassword(false);
      setNewPassword('');
      setShowNewPassword(false);
      setConfirmPassword('');
      setShowConfirmPassword(false);
      setError('');
      setIsLoading(false);
    });
  }, [isOpen]);

  const passwordValidation = validatePassword(newPassword);
  const isPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isSaveEnabled = step === 2 && passwordValidation.isValid && isPasswordsMatch && !isLoading;

  const handleVerifyStep1 = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', currentPassword }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(
          typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Mật khẩu hiện tại không chính xác.',
        );
        return;
      }
      setStep(2);
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeStep2 = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isSaveEnabled) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change', currentPassword, newPassword }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setError(
          typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Không thể đổi mật khẩu. Vui lòng thử lại.',
        );
        return;
      }
      setStep('success');
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      onClose();
      router.replace('/login');
      router.refresh();
    }
  };

  const renderFooter = () => {
    if (step === 'success') {
      return (
        <div className="flex w-full justify-end">
          <Button onClick={() => void handleLogout()} variant="primary">
            Đăng xuất
          </Button>
        </div>
      );
    }

    if (step === 1) {
      return (
        <>
          {isForceChangePassword ? (
            <Button onClick={() => void handleLogout()} variant="outline">
              Thoát
            </Button>
          ) : (
            <Button onClick={onClose} variant="outline">
              Hủy
            </Button>
          )}
          <Button isLoading={isLoading} onClick={() => void handleVerifyStep1()} variant="primary">
            Tiếp tục
          </Button>
        </>
      );
    }

    return (
      <>
        {isForceChangePassword && (
          <Button onClick={() => void handleLogout()} variant="outline">
            Thoát
          </Button>
        )}
        <Button onClick={() => setStep(1)} variant="outline">
          Quay lại
        </Button>
        <Button disabled={!isSaveEnabled} isLoading={isLoading} onClick={() => void handleChangeStep2()} variant="primary">
          Lưu
        </Button>
      </>
    );
  };

  return (
    <Modal
      footer={renderFooter()}
      isOpen={isOpen}
      onClose={step === 'success' || isForceChangePassword ? () => {} : onClose}
      title={step === 'success' ? 'Đổi mật khẩu thành công' : isForceChangePassword ? `Đổi mật khẩu lần đầu (Bước ${step}/2)` : `Đổi mật khẩu (Bước ${step}/2)`}
    >
      {step === 'success' ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle className="size-16 text-status-success" weight="fill" />
          <div>
            <h3 className="text-base font-bold text-fb-text-primary">Đổi mật khẩu thành công!</h3>
            <p className="mt-2 text-sm text-fb-text-secondary">
              Mật khẩu của bạn đã được cập nhật. Vui lòng đăng xuất và đăng nhập lại bằng mật khẩu mới.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {isForceChangePassword && (
            <Alert title="Yêu cầu đổi mật khẩu lần đầu" variant="warning">
              Tài khoản của bạn cần đổi mật khẩu lần đầu để đảm bảo bảo mật trước khi tiếp tục sử dụng hệ thống.
            </Alert>
          )}

          {error && <Alert title="Lỗi" variant="error">{error}</Alert>}

          {step === 1 && (
            <form className="flex flex-col gap-4" onSubmit={(e) => void handleVerifyStep1(e)}>
              <p className="text-sm text-fb-text-secondary">
                Để bảo mật, vui lòng nhập lại mật khẩu hiện tại của bạn để tiếp tục.
              </p>
              <div className="relative">
                <Input
                  className="pr-10"
                  label="Mật khẩu hiện tại"
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                />
                <button
                  aria-label="Hiện hoặc ẩn mật khẩu"
                  className="absolute right-3 top-9 text-fb-text-secondary hover:text-fb-text-primary"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  type="button"
                >
                  {showCurrentPassword ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form className="flex flex-col gap-4" onSubmit={(e) => void handleChangeStep2(e)}>
              <div className="rounded-md border border-fb-border bg-fb-surface-muted p-3 text-xs text-fb-text-secondary">
                <p className="font-semibold text-fb-text-primary mb-1">Quy tắc mật khẩu:</p>
                <p>{PASSWORD_REQUIREMENTS_GUIDE}</p>
              </div>

              <div className="relative">
                <Input
                  className="pr-10"
                  label="Mật khẩu mới"
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                />
                <button
                  aria-label="Hiện hoặc ẩn mật khẩu"
                  className="absolute right-3 top-9 text-fb-text-secondary hover:text-fb-text-primary"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  type="button"
                >
                  {showNewPassword ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>

              <div className="relative">
                <Input
                  className="pr-10"
                  label="Nhập lại mật khẩu mới"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                />
                <button
                  aria-label="Hiện hoặc ẩn mật khẩu"
                  className="absolute right-3 top-9 text-fb-text-secondary hover:text-fb-text-primary"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  type="button"
                >
                  {showConfirmPassword ? <EyeSlash className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>

              {confirmPassword.length > 0 && !isPasswordsMatch && (
                <p className="text-xs font-medium text-status-danger">Mật khẩu mới nhập lại không khớp.</p>
              )}
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
