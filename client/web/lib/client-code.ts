/**
 * Email sign-in codes for client logins (client logins C2b), the pure half.
 * A client with no sign-in link types their email on /client-signin; the
 * brain answers the same for every email and, when it is an active client
 * login, mails an 8-digit code that works for 10 minutes in THIS browser
 * (the request cookie the answer sets). The client types the code and is
 * signed in for 30 days.
 *
 * The request never says whether an email is a client, so the page has ONE
 * way forward from it: any 2xx is "sent", read the same for everyone. No
 * React and no fetch here, so each rule is pinned by a test
 * (client-code.test.ts).
 *
 * Server: GET and POST /api/auth/client-code, POST
 * /api/auth/client-code/verify (all public, under /api/auth).
 */
import type { ClientCodeAvailability } from './contract-next';

export const CLIENT_CODE_PATH = '/api/auth/client-code';
export const CLIENT_CODE_VERIFY_PATH = '/api/auth/client-code/verify';

/** Digits in a code, and how long one works, as the brain sets them. */
export const CLIENT_CODE_LENGTH = 8;
export const CLIENT_CODE_LIFETIME_MINUTES = 10;

/** Whether GET /api/auth/client-code's answer says this brain sends codes.
 *  Anything but a plain yes is no: a brain before C2b answers 404, and a
 *  failed check must not offer a way in that is not there. */
export function clientCodesEnabled(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return false;
  return (body as Partial<ClientCodeAvailability>).enabled === true;
}

// ── Asking for a code ───────────────────────────────────────────────────────

/** What the page says once a code was asked for, whoever asked. */
export const CLIENT_CODE_SENT =
  `If this email has a client login, we sent it a code. It works for ` +
  `${CLIENT_CODE_LIFETIME_MINUTES} minutes, in this browser.`;
export const CLIENT_CODE_RATE_LIMITED = 'Too many attempts. Wait a minute, then try again.';
const REQUEST_FAILED = 'Could not ask for a code. Try again.';

export type ClientCodeRequestOutcome =
  { kind: 'sent'; message: string } | { kind: 'error'; message: string };

/**
 * What POST /api/auth/client-code's answer means. Every 2xx is the same
 * `sent`, whatever the body carries: the brain answers a client and a
 * stranger alike, and the page must not find a difference the brain did not
 * mean to give.
 */
export function clientCodeRequestOutcome(status: number): ClientCodeRequestOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent', message: CLIENT_CODE_SENT };
  if (status === 429) return { kind: 'error', message: CLIENT_CODE_RATE_LIMITED };
  return { kind: 'error', message: REQUEST_FAILED };
}

// ── Signing in with it ──────────────────────────────────────────────────────

/** The one sentence for a code that signs nobody in (the brain's own). */
export const CLIENT_CODE_NOT_VALID = 'That code did not work. Ask for a new one.';
export const CLIENT_CODE_TOO_MANY = 'Too many tries. Wait a few minutes, then ask for a new code.';
const VERIFY_FAILED = 'Could not sign you in. Try again.';

export type ClientCodeVerifyOutcome =
  | { kind: 'ok' }
  /** Wrong, used, expired or dead code, another browser's, a wrong email:
   *  one answer for every reason, as the brain gives one. */
  | { kind: 'not-valid'; message: string }
  | { kind: 'error'; message: string };

/** What POST /api/auth/client-code/verify's answer means. A 401 is never
 *  "signed out" here: nobody is signed in yet. */
export function clientCodeVerifyOutcome(status: number, body: unknown): ClientCodeVerifyOutcome {
  const b = body && typeof body === 'object' ? (body as { ok?: unknown; error?: unknown }) : {};
  if (status >= 200 && status < 300 && b.ok === true) return { kind: 'ok' };
  if (status === 401) {
    const said = typeof b.error === 'string' ? b.error.trim() : '';
    return { kind: 'not-valid', message: said || CLIENT_CODE_NOT_VALID };
  }
  if (status === 429) return { kind: 'error', message: CLIENT_CODE_TOO_MANY };
  return { kind: 'error', message: VERIFY_FAILED };
}

/** The code as typed or pasted, as it is sent: spaces (and a dash a mail
 *  client may put in the middle) taken out. */
export function normalizeClientCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '');
}

const CODE_RE = new RegExp(`^\\d{${CLIENT_CODE_LENGTH}}$`);

/** The check before a code is sent; null when it may go. */
export function clientCodeError(raw: string): string | null {
  const code = normalizeClientCode(raw);
  if (!code) return `Enter the ${CLIENT_CODE_LENGTH}-digit code from the email.`;
  return CODE_RE.test(code) ? null : `The code is ${CLIENT_CODE_LENGTH} digits.`;
}
