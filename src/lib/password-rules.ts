/** Owner 2026-11-27: the app now runs inside the company network — a password only needs a minimum length. The random
 * password given to a user (generateCompliantPassword) keeps its stronger shape. */
export const PASSWORD_MIN_LENGTH = 5;
export const PASSWORD_MAX_LENGTH = 256;

export const PASSWORD_REQUIREMENTS_GUIDE = `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`;

export interface PasswordValidationResult {
  error?: string;
  isValid: boolean;
}

export function validatePassword(password: string): PasswordValidationResult {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return { isValid: false, error: `Mật khẩu phải có tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { isValid: false, error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.` };
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
