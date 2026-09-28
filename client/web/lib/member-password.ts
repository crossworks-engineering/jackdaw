/**
 * A member changes their own password (member logins, Phase 5 profile trim).
 * The brain's POST /api/auth/change-password serves every login, admin or
 * member, and changes the LOGIN's own credential; sessions stay signed in.
 *
 * Its answers do not fit `apiFetch`: a wrong current password is a 401, and
 * `apiFetch` reads every 401 as a dead session and sends the browser to
 * /login. So the form reads the raw answer, and this module says what it
 * means. Pure, so the split between "wrong password" and "signed out" is
 * pinned by a test.
 */

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 1024;

export type PasswordForm = { current: string; next: string; confirm: string };
export type PasswordErrors = Partial<Record<keyof PasswordForm, string>>;

/** The same rules the brain applies, checked before anything is sent. */
export function validatePasswordForm(f: PasswordForm): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!f.current) errors.current = 'Enter your current password.';
  if (!f.next) errors.next = 'Enter a new password.';
  else if (f.next.length < MIN_PASSWORD) errors.next = `Use at least ${MIN_PASSWORD} characters.`;
  else if (f.next.length > MAX_PASSWORD) errors.next = 'That password is too long.';
  else if (f.current && f.next === f.current)
    errors.next = 'The new password must be different from the current one.';
  if (!errors.next && f.confirm !== f.next) errors.confirm = 'The two new passwords differ.';
  return errors;
}

/** The brain's error message text for a wrong current password. */
const WRONG_CURRENT = 'Current password is incorrect.';

export type PasswordOutcome =
  | { kind: 'ok' }
  /** The current password did not match: stay on the form. */
  | { kind: 'wrong-current'; message: string }
  /** The session is gone: send the browser to sign in. */
  | { kind: 'signed-out' }
  /** Anything else (a rule, the hourly limit, the brain down): say it. */
  | { kind: 'error'; message: string };

export function passwordOutcome(status: number, body: unknown): PasswordOutcome {
  const error =
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null;
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 401) {
    return error === WRONG_CURRENT
      ? { kind: 'wrong-current', message: 'That is not your current password.' }
      : { kind: 'signed-out' };
  }
  if (status === 429) {
    return { kind: 'error', message: error ?? 'Too many attempts. Try again later.' };
  }
  if (status === 400 && error) return { kind: 'error', message: error };
  return { kind: 'error', message: 'Could not change your password. Try again.' };
}
