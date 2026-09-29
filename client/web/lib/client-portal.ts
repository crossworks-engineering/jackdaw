/**
 * The client portal (client logins C2), the pure half: the client API's
 * paths, what the sign-in answers mean, and the rule that a reference a
 * client may not read is plain text. A CLIENT login reads items at client
 * level only, through /api/client/* (the brain refuses it everywhere else);
 * its app is one screen, "Shared with you", and read-only viewers.
 *
 * No React and no fetch here, so every rule is pinned by a test
 * (client-portal.test.ts).
 */
import type { JSONContent } from '@tiptap/core';
import { ApiError } from '@mantle/web-ui/api-fetch';
import { assetTokenRefreshDelayMs } from '@mantle/web-ui/token-claims';
import { CLIENT_PRIVATE_LABEL } from '@mantle/client-types/dto/client';
import type { MemberItemKind } from './member-kinds';
import type { SpaceApiBase } from './member-space';
import { clientItemIdFromPath } from './client-surface';

export { CLIENT_PRIVATE_LABEL };

// ── Paths ───────────────────────────────────────────────────────────────────

/** The client routes' base. The member twin is MEMBER_API_BASE. */
export const CLIENT_API_BASE = '/api/client' satisfies SpaceApiBase;

/** "Shared with you", one page (`?kind=&q=&page=`), newest first. No kind:
 *  every kind. */
export function sharedListPath(opts: { kind?: MemberItemKind | null; q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (opts.kind) sp.set('kind', opts.kind);
  if (opts.q?.trim()) sp.set('q', opts.q.trim());
  sp.set('page', String(opts.page ?? 1));
  return `${CLIENT_API_BASE}/shared?${sp.toString()}`;
}

/** One shared item; a table reads one tab (`tabId`, else its first). */
export function sharedItemPath(id: string, tabId?: string | null): string {
  const base = `${CLIENT_API_BASE}/shared/${encodeURIComponent(id)}`;
  return tabId ? `${base}?tab=${encodeURIComponent(tabId)}` : base;
}

export const clientFileUrlPath = (id: string) => `${CLIENT_API_BASE}/files/${id}`;
export const clientDrawUrlPath = (id: string) => `${CLIENT_API_BASE}/draws/${id}/svg`;

const FILE_RE = /^\/api\/files\/files\/([0-9a-f-]{36})(?:\?.*)?$/i;
const DRAW_RE = /^\/api\/draws\/([0-9a-f-]{36})\/svg(?:\?.*)?$/i;

/** The admin asset paths a stored page document carries, mapped onto the
 *  client byte routes (the member twin is memberAssetPath). The brain serves
 *  them at the client level; anything else passes through unchanged. */
export function clientAssetPath(path: string): string {
  const file = FILE_RE.exec(path);
  if (file) return clientFileUrlPath(file[1]!);
  const draw = DRAW_RE.exec(path);
  if (draw) return clientDrawUrlPath(draw[1]!);
  return path;
}

// ── The client shell ────────────────────────────────────────────────────────

/**
 * How often the client shell is asked again. A client has no realtime (no
 * event stream, plan section 7), so this poll is what notices an ended
 * session: an admin's End sessions, Disable or Delete makes the next answer
 * a 401, and apiFetch sends the browser to sign in. Sooner when the asset
 * token needs renewing before then.
 */
export const CLIENT_SHELL_POLL_MS = 60_000;

export function clientShellPollMs(assetToken: string | null | undefined, nowMs = Date.now()) {
  const renew = assetTokenRefreshDelayMs(assetToken, nowMs);
  return renew === false ? CLIENT_SHELL_POLL_MS : Math.min(renew, CLIENT_SHELL_POLL_MS);
}

/** What the client portal shows for its shell query: the portal only once
 *  the shell answered (so the chrome is never drawn half-branded), a
 *  neutral loading screen before, the plain client screen for a brain
 *  without the client routes (404), Try again for anything else. A 401 is
 *  already on its way to sign-in. */
export type ClientPortalView = 'ready' | 'loading' | 'unavailable' | 'failed';

export function clientPortalView(q: { data?: unknown; error?: unknown }): ClientPortalView {
  if (q.data !== undefined && q.data !== null) return 'ready';
  if (q.error == null) return 'loading';
  if (q.error instanceof ApiError && q.error.status === 404) return 'unavailable';
  if (q.error instanceof ApiError && q.error.status === 401) return 'loading';
  return 'failed';
}

// ── References a client may not read ────────────────────────────────────────

type Mark = NonNullable<JSONContent['marks']>[number];

/** A link mark that points nowhere, or names the private label: the brain's
 *  redaction of a link to something a client may not read. */
function isPrivateLink(mark: Mark, text: string | undefined): boolean {
  if (mark.type !== 'link') return false;
  const href = (mark.attrs as { href?: unknown } | undefined)?.href;
  return typeof href !== 'string' || !href.trim() || text === CLIENT_PRIVATE_LABEL;
}

/** A mention chip with no target, or one naming the private label. */
function isPrivateMention(node: JSONContent): boolean {
  if (node.type !== 'mention') return false;
  const attrs = (node.attrs ?? {}) as { id?: unknown; label?: unknown };
  return typeof attrs.id !== 'string' || !attrs.id.trim() || attrs.label === CLIENT_PRIVATE_LABEL;
}

/**
 * A page document as a client reads it: every reference the brain redacted
 * (a mention chip or a link naming "Private item" and pointing nowhere) is
 * PLAIN TEXT, so nothing in it looks or acts like a way through. A private
 * mention becomes the label as text; a private link keeps its text and loses
 * the link. Everything else is left as it came. Pure: returns a new tree.
 */
export function clientDoc(doc: JSONContent): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    if (isPrivateMention(node)) return { type: 'text', text: CLIENT_PRIVATE_LABEL };
    let next = node;
    if (node.marks?.some((m) => isPrivateLink(m, node.text))) {
      const marks = node.marks.filter((m) => !isPrivateLink(m, node.text));
      next = { ...node, marks };
      if (marks.length === 0) delete next.marks;
    }
    if (next.content) next = { ...next, content: next.content.map(walk) };
    return next;
  };
  return walk(doc);
}

/**
 * A note's markdown as a client reads it: a link the brain redacted
 * (`[Private item]()`, or any link to nowhere) is its text alone, so it
 * renders as plain text, never an anchor.
 */
export function clientNoteMarkdown(content: string): string {
  // `[text](target)`, not an image (`![…]`). The target may be empty, `#`,
  // or anything when the text is the private label.
  return content.replace(
    /(^|[^!\\])\[([^\]\n]*)\]\(\s*([^)\s]*)(?:\s+"[^"\n]*")?\s*\)/g,
    (all, pre: string, text: string, target: string) =>
      !target || target === '#' || text === CLIENT_PRIVATE_LABEL ? `${pre}${text}` : all,
  );
}

/**
 * The item a link in a shared page names, when it is one of the brain's own
 * item routes on this app (`/n/<id>`, `/pages/<id>`, …): the reader opens it
 * in the portal instead of following it to a screen a client has no part
 * of. Null for any other link (it opens as a link), and for one to another
 * origin.
 */
export function clientLinkItemId(href: string | null | undefined, origin: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin) return null;
    return clientItemIdFromPath(url.pathname);
  } catch {
    return null;
  }
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

/** What a client reads when the link does not sign them in: one sentence for
 *  every reason, as the brain gives one answer for every reason. */
export const CLIENT_LINK_NOT_VALID = 'This sign-in link is not valid. Ask for a new one.';
export const CLIENT_LINK_RATE_LIMITED = 'Too many attempts. Try again in a minute.';

export type ClientSignInOutcome =
  | { kind: 'ok' }
  /** The link signs nobody in (bad, used, expired, revoked, wrong email). */
  | { kind: 'not-valid'; message: string }
  | { kind: 'error'; message: string };

/** What POST /api/auth/client-link's answer means. A 401 is never "signed
 *  out" here: nobody is signed in yet. */
export function clientSignInOutcome(status: number, body: unknown): ClientSignInOutcome {
  const ok = !!body && typeof body === 'object' && (body as { ok?: unknown }).ok === true;
  if (status >= 200 && status < 300 && ok) return { kind: 'ok' };
  if (status === 401) return { kind: 'not-valid', message: CLIENT_LINK_NOT_VALID };
  if (status === 429) return { kind: 'error', message: CLIENT_LINK_RATE_LIMITED };
  return { kind: 'error', message: 'Could not sign you in. Try again.' };
}

/** The code a sign-in link carries (`/client-signin?code=…`). Codes never
 *  hold whitespace; anything more is the brain's to judge. */
export function readClientCode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The email check before anything is sent; null when it may go. */
export function clientEmailError(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email address.';
  return EMAIL_RE.test(e) ? null : 'That does not look like an email address.';
}
