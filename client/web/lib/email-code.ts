/**
 * Sign-in by email code, the pure half (plan 15: a sign-in method for any
 * login without a password). On the sign-in page a person types their
 * email; the brain answers the same for every email and, when it is a login
 * that may use a code, mails an 8-digit code that works for 10 minutes in
 * THIS browser (the request cookie the answer sets). The person types the
 * code and is signed in.
 *
 * The request never says whether an email has a login, so the page has ONE
 * way forward from it: any 2xx is "sent", read the same for everyone. No
 * React and no fetch here, so each rule is pinned by a test
 * (email-code.test.ts).
 *
 * Server: GET and POST EMAIL_CODE_PATH, POST EMAIL_CODE_VERIFY_PATH (all
 * public, under /api/auth). The paths keep their old names until the brain
 * contract renames them: these two constants are the one place they live.
 */
import type { ClientCodeAvailability } from '@mantle/client-types';

export const EMAIL_CODE_PATH = '/api/auth/client-code';
export const EMAIL_CODE_VERIFY_PATH = '/api/auth/client-code/verify';

/** Digits in a code, and how long one works, as the brain sets them. */
export const EMAIL_CODE_LENGTH = 8;
export const EMAIL_CODE_LIFETIME_MINUTES = 10;

/** Whether GET EMAIL_CODE_PATH's answer says this brain sends codes.
 *  Anything but a plain yes is no: a brain without the route answers 404,
 *  and a failed check must not offer a way in that is not there. */
export function emailCodesEnabled(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return false;
  return (body as Partial<ClientCodeAvailability>).enabled === true;
}

/**
 * Whether the sign-in page offers "Sign in with an email code": the brain
 * sends codes, it is not the first run (no login exists yet), it is not
 * adding a login on the desktop (a code signs in with a cookie and no
 * bearer, so it cannot be one more login the device holds), and the page
 * is on the brain's own origin (the code's cookies live there).
 */
export function offersEmailCode(o: {
  enabled: boolean;
  firstRun: boolean;
  add: boolean;
  crossOrigin: boolean;
}): boolean {
  return o.enabled && !o.firstRun && !o.add && !o.crossOrigin;
}

/** Said when the code form would post from another origin. */
export const EMAIL_CODE_UNAVAILABLE = 'Sign-in by email code is not available on this address.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The check on the email before a code is asked for; null when it may go. */
export function emailAddressError(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email address.';
  return EMAIL_RE.test(e) ? null : 'That does not look like an email address.';
}

// ── Asking for a code ───────────────────────────────────────────────────────

/** What the page says once a code was asked for, whoever asked. */
export const EMAIL_CODE_SENT =
  `If this email has a login, we sent it a code. It works for ` +
  `${EMAIL_CODE_LIFETIME_MINUTES} minutes, in this browser.`;
export const EMAIL_CODE_RATE_LIMITED = 'Too many attempts. Wait a minute, then try again.';
const REQUEST_FAILED = 'Could not ask for a code. Try again.';

export type EmailCodeRequestOutcome =
  { kind: 'sent'; message: string } | { kind: 'error'; message: string };

/**
 * What POST EMAIL_CODE_PATH's answer means. Every 2xx is the same `sent`,
 * whatever the body carries: the brain answers a login and a stranger
 * alike, and the page must not find a difference the brain did not mean to
 * give.
 */
export function emailCodeRequestOutcome(status: number): EmailCodeRequestOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent', message: EMAIL_CODE_SENT };
  if (status === 429) return { kind: 'error', message: EMAIL_CODE_RATE_LIMITED };
  return { kind: 'error', message: REQUEST_FAILED };
}

// ── Signing in with it ──────────────────────────────────────────────────────

/** The one sentence for a code that signs nobody in (the brain's own). */
export const EMAIL_CODE_NOT_VALID = 'That code did not work. Ask for a new one.';
export const EMAIL_CODE_TOO_MANY = 'Too many tries. Wait a few minutes, then ask for a new code.';
const VERIFY_FAILED = 'Could not sign you in. Try again.';

export type EmailCodeVerifyOutcome =
  | { kind: 'ok' }
  /** Wrong, used, expired or dead code, another browser's, a wrong email:
   *  one answer for every reason, as the brain gives one. */
  | { kind: 'not-valid'; message: string }
  | { kind: 'error'; message: string };

/** What POST EMAIL_CODE_VERIFY_PATH's answer means. A 401 is never "signed
 *  out" here: nobody is signed in yet. */
export function emailCodeVerifyOutcome(status: number, body: unknown): EmailCodeVerifyOutcome {
  const b = body && typeof body === 'object' ? (body as { ok?: unknown; error?: unknown }) : {};
  if (status >= 200 && status < 300 && b.ok === true) return { kind: 'ok' };
  if (status === 401) {
    const said = typeof b.error === 'string' ? b.error.trim() : '';
    return { kind: 'not-valid', message: said || EMAIL_CODE_NOT_VALID };
  }
  if (status === 429) return { kind: 'error', message: EMAIL_CODE_TOO_MANY };
  return { kind: 'error', message: VERIFY_FAILED };
}

/** The code as typed or pasted, as it is sent: spaces (and a dash a mail
 *  client may put in the middle) taken out. */
export function normalizeEmailCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '');
}

const CODE_RE = new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`);

/** The check before a code is sent; null when it may go. */
export function emailCodeError(raw: string): string | null {
  const code = normalizeEmailCode(raw);
  if (!code) return `Enter the ${EMAIL_CODE_LENGTH}-digit code from the email.`;
  return CODE_RE.test(code) ? null : `The code is ${EMAIL_CODE_LENGTH} digits.`;
}
