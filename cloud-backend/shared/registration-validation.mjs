// Shared by the account form and both cloud registration paths.
// Preserve existing normalization: trim account/email, compare accounts case-insensitively;
// never trim or rewrite passwords.
export const USERNAME_HINT = '3–32 位英文字母、数字或下划线（不区分大小写）';
export const USERNAME_ERROR = '账号需为 3–32 位英文字母、数字或下划线（不区分大小写），不能含中文、空格或其他符号';
export function validateRegistration(payload) {
  const username = String(payload?.username || '').trim().toLowerCase();
  const email = String(payload?.email || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return { field: 'username', message: USERNAME_ERROR };
  if (String(payload?.password || '').length < 6) return { field: 'password', message: '密码至少需要 6 位' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { field: 'email', message: '邮箱地址格式不正确' };
  if (!String(payload?.inviteCode || '').trim()) return { field: 'inviteCode', message: '请输入管理员发放的邀请码' };
  return null;
}
