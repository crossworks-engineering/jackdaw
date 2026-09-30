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
import { CLIENT_ACCEPTED_KEY, CLIENT_REQUESTS_KEY } from './client-requests';
import { CLIENT_APPS_KEY } from './client-apps';

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

export const clientFileUrlPath = (id: string) =>
  `${CLIENT_API_BASE}/files/${encodeURIComponent(id)}`;
export const clientDrawUrlPath = (id: string) =>
  `${CLIENT_API_BASE}/draws/${encodeURIComponent(id)}/svg`;

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

const MEDIA_RE = /^media:([0-9a-f-]{36})$/i;
const DRAW_REF_RE = /^draw:([0-9a-f-]{36})$/i;

/**
 * A picture in a client's note (client tier audit U4): a note is markdown,
 * and the brain keeps a readable picture as it was written, so it may name
 * the owner's file route (`/api/files/files/<id>`), a drawing's
 * (`/api/draws/<id>/svg`) or the app's own schemes (`media:<id>`,
 * `draw:<id>`). Each maps onto the client byte routes; anything else (an
 * external or `data:` picture, a path this does not know) is null, and the
 * reader draws no picture for it. A client never asks an admin route, and
 * never loads a picture from another site.
 */
export function clientNoteImagePath(src: string): string | null {
  const s = src.trim();
  const file = FILE_RE.exec(s) ?? MEDIA_RE.exec(s);
  if (file) return clientFileUrlPath(file[1]!);
  const draw = DRAW_RE.exec(s) ?? DRAW_REF_RE.exec(s);
  if (draw) return clientDrawUrlPath(draw[1]!);
  return null;
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
 *  without the client routes (404), Try again (and Sign out) for anything
 *  else. A 401 is already on its way to sign-in. `offline`: the device has
 *  no network, so TanStack parks the first ask instead of failing it, and
 *  without this the portal sat on Loading with no way out (audit B27). */
export type ClientPortalView = 'ready' | 'loading' | 'unavailable' | 'failed' | 'offline';

export function clientPortalView(q: {
  data?: unknown;
  error?: unknown;
  fetchStatus?: string;
}): ClientPortalView {
  if (q.data !== undefined && q.data !== null) return 'ready';
  if (q.fetchStatus === 'paused') return 'offline';
  if (q.error == null) return 'loading';
  if (q.error instanceof ApiError && q.error.status === 404) return 'unavailable';
  if (q.error instanceof ApiError && q.error.status === 401) return 'loading';
  return 'failed';
}

/** The portal's own queries: "Shared with you" (every kind, query and page)
 *  and the open item (every tab). */
export const CLIENT_SHARED_KEY = ['client-shared'] as const;
export const CLIENT_ITEM_KEY = ['client-item'] as const;

/** The client's own open item: MineItem's key (client logins C5). */
export const CLIENT_OWN_ITEM_KEY = ['member-space-item'] as const;

/**
 * Ask the lists and the open item again. A client has no realtime, so the
 * portal does this on every successful shell poll and when the window gets
 * focus: an item shared or unshared since, or changed, shows without a
 * reload (audit B27); so does a request a reviewer returned or accepted
 * (C5: My requests, the own item and the accepted one), and an app an admin
 * made available or took back (C6: the Apps list, which the rail follows).
 */
export function refreshClientPortal(queryClient: {
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<void>;
}): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: CLIENT_SHARED_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_ITEM_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_REQUESTS_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_OWN_ITEM_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_ACCEPTED_KEY }),
    queryClient.invalidateQueries({ queryKey: CLIENT_APPS_KEY }),
  ]);
}

/** Whether a shell answer is a NEW successful poll (not the first answer,
 *  which the list has not been asked before, and not a re-render). */
export function isNewShellAnswer(prevUpdatedAt: number, nextUpdatedAt: number): boolean {
  return prevUpdatedAt > 0 && nextUpdatedAt > prevUpdatedAt;
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

/**
 * The item a mention chip in a shared page opens, when it is one the client
 * may read: a chip naming a brain item (`ref` node) that the brain left its
 * id. A chip the brain redacted has no id (or names "Private item") and is
 * plain text already (clientDoc); a person or project chip (`ref` entity)
 * names nothing a client can open. Null: not a way anywhere.
 */
export function clientMentionItemId(attrs: {
  id?: string | null;
  ref?: string | null;
  label?: string | null;
}): string | null {
  const id = attrs.id?.trim();
  if (!id || attrs.ref !== 'node' || attrs.label === CLIENT_PRIVATE_LABEL) return null;
  return id;
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

/** What a split-origin setup (the API on another origin) shows instead of
 *  any client sign-in form: a client's session is a cookie on the brain's
 *  own origin, so signing in from here would spend the link (or the code)
 *  and leave nobody signed in. Nothing is posted. */
export const CLIENT_SIGNIN_UNAVAILABLE = 'Client sign-in is not available on this address.';

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

/** The code a sign-in link carries (`/client-signin#code=…`, or `?code=…`
 *  in links issued before). Codes never hold whitespace; anything more is
 *  the brain's to judge. */
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
