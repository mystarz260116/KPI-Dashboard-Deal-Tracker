export const PASSWORD_POLICY_MESSAGE = 'パスワードは8文字以上で、英大文字・英小文字・記号をそれぞれ1文字以上含めてください';

export function isValidPassword(password: string) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
