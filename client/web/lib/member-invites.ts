/**
 * Member invites (member logins, Phase 6), the client's side. An admin makes
 * an invite on /team-admin and hands over the link; the person opens /invite,
 * sets a password and is a member login.
 *
 * The public half cannot use `apiFetch`: the accept route answers every bad
 * code with a 401, and `apiFetch` reads a 401 as a dead session and sends the
 * browser to /login, which would throw the person off the page they are on.
 * So /invite reads the raw answers and this module says what they mean. Pure,
 * so each wording and each split is pinned by a test.
 */
import { MIN_PASSWORD } from './member-password';

export { MIN_PASSWORD };

/** How long an invite lives, as the brain sets it (docs/member-logins.md §9). */
export const INVITE_LIFETIME_HOURS = 72;

/** The link an admin shares: the client's own origin plus the brain's
 *  `linkPath` (`/invite?code=…`). */
export function inviteLink(origin: string, linkPath: string): string {
  const path = linkPath.startsWith('/') ? linkPath : `/${linkPath}`;
  return `${origin.replace(/\/+$/, '')}${path}`;
}

/**
 * The code in what a person typed or pasted: a bare invite code, or the whole
 * invite link. Codes are case sensitive and never contain spaces, so only
 * whitespace is dropped. Nothing else is judged here: whether a code redeems
 * is the brain's answer (an old 8-character team code gets its 404, the same
 * "not valid" as any other).
 */
export function readInviteCode(input: string): string {
  const raw = input.trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/invite')) {
    try {
      const code = new URL(raw, 'http://invite.local').searchParams.get('code');
      if (code) return code.replace(/\s+/g, '');
    } catch {
      // Not a URL after all: fall through and treat it as a code.
    }
  }
  return raw.replace(/\s+/g, '');
}

/** What the admin is told when a create is refused. `reason` is the brain's
 *  MemberInviteError reason (409 for an existing login, 400 otherwise). */
export function inviteCreateErrorText(
  status: number,
  body: { reason?: unknown; error?: unknown } | undefined,
): string {
  switch (body?.reason) {
    case 'email-has-login':
      return 'Someone already signs in with that email. Find them in Settings > Users.';
    case 'contact-has-login':
      return 'This contact already has a login. Find them in Settings > Users.';
    case 'no-email':
      return 'This contact has no email address. Enter the email the invite is for.';
    case 'contact-not-found':
      return 'That contact is not in this brain any more.';
  }
  if (status === 400) return 'Enter a valid email address.';
  if (typeof body?.error === 'string' && body.error) return body.error;
  return 'Could not create the invite. Try again.';
}

/** Shown when the preview answers 404: the code redeems nothing. */
export const INVITE_NOT_VALID =
  'This invite is not valid or has expired. Ask your admin for a new one.';

/** Shown when accept answers 401: the same words for every reason, as the
 *  brain gives the same answer for every reason. */
export const CODE_NOT_VALID = 'That code is not valid. Ask your admin for a new invite.';

export type InviteForm = { code: string; password: string; confirm: string };
export type InviteFormErrors = Partial<Record<keyof InviteForm, string>>;

/** The brain's rules, checked before anything is sent. */
export function validateInviteForm(f: InviteForm): InviteFormErrors {
  const errors: InviteFormErrors = {};
  if (!readInviteCode(f.code)) errors.code = 'Enter your invite code.';
  if (!f.password) errors.password = 'Choose a password.';
  else if (f.password.length < MIN_PASSWORD)
    errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  if (!errors.password && f.confirm !== f.password) errors.confirm = 'The two passwords differ.';
  return errors;
}

export type AcceptOutcome =
  | { kind: 'ok'; email: string }
  /** The code redeems nothing: stay on the page and say so. */
  | { kind: 'bad-code'; message: string }
  /** A rule, the rate limit, the brain down: say it. */
  | { kind: 'error'; message: string };

/** What POST /api/auth/invite/accept's answer means. A 401 is never "signed
 *  out" here: nobody is signed in yet. */
export function acceptOutcome(status: number, body: unknown): AcceptOutcome {
  const b = body && typeof body === 'object' ? (body as { error?: unknown; email?: unknown }) : {};
  const error = typeof b.error === 'string' && b.error ? b.error : null;
  if (status >= 200 && status < 300) {
    return { kind: 'ok', email: typeof b.email === 'string' ? b.email : '' };
  }
  if (status === 401) return { kind: 'bad-code', message: CODE_NOT_VALID };
  if (status === 429)
    return { kind: 'error', message: error ?? 'Too many attempts. Try again in a minute.' };
  if (status === 400 && error) return { kind: 'error', message: error };
  return { kind: 'error', message: 'Could not accept the invite. Try again.' };
}
