export const PASSWORD_REQUIREMENTS_GUIDE =
  'Mật khẩu tối thiểu 6 ký tự, gồm ít nhất 1 chữ hoa và 1 ký tự biểu tượng (ví dụ: !@#$%^&*).';

export interface PasswordValidationResult {
  error?: string;
  isValid: boolean;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password || password.length < 6) {
    return { isValid: false, error: 'Mật khẩu phải có tối thiểu 6 ký tự.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Mật khẩu phải chứa ít nhất 1 chữ hoa.' };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { isValid: false, error: 'Mật khẩu phải chứa ít nhất 1 ký tự biểu tượng.' };
  }
  return { isValid: true };
}

export function generateCompliantPassword(): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';
  const all = uppers + lowers + numbers + symbols;

  const charArray: string[] = [
    uppers.charAt(Math.floor(Math.random() * uppers.length)),
    symbols.charAt(Math.floor(Math.random() * symbols.length)),
    lowers.charAt(Math.floor(Math.random() * lowers.length)),
    numbers.charAt(Math.floor(Math.random() * numbers.length)),
  ];

  for (let i = 0; i < 6; i++) {
    charArray.push(all.charAt(Math.floor(Math.random() * all.length)));
  }

  return charArray.sort(() => 0.5 - Math.random()).join('');
}
