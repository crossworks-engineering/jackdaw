/**
 * The logins this device is holding.
 *
 * A SESSION is one (brain origin, login, device bearer) triple. A device keeps
 * a list of them and at most one is active. Two sessions may point at the same
 * brain with different logins, or at different brains with the same email;
 * both are ordinary. This is client state only: a brain has no notion of "the
 * other servers this person also uses", and its job is unchanged (mint a
 * revocable per-device bearer, say who it is, revoke it).
 *
 * Storage, browser:
 *   mantle_sessions          the list, JSON
 *   mantle_active_session    the active session's id
 *   mantle_token:<id>        one bearer per session
 *   mantle_token             MIRRORS the active bearer
 *
 * The mirror is not a convenience. `mantle_token` is contract with
 * e2e/lib/contract.ts, which seeds it directly, and with every shipped build
 * that may still be open in another tab and will write a rotated bearer there
 * and nowhere else. So the mirror is read as the truth about the active
 * bearer and the registry catches up to it (`reconcile`), never the reverse.
 *
 * Inside the desktop shell the bearer lives in the shell's vault, which holds
 * exactly one token per brain window until the shell learns session-scoped
 * vault calls. There, no bearer is ever written to localStorage, and the list
 * holds the one session the vault can back.
 *
 * The rule every line here is written under: an upgrade signs nobody out.
 */
import './desktop-shell'; // global Window.mantleDesktop declaration
import { runtimeApiBase } from './runtime-env';
import { tokenExpEpoch } from './token-claims';

export type Session = {
  /** Random, device-local. Not a secret and not known to any brain. */
  id: string;
  /** Brain origin, e.g. https://brain.example. */
  origin: string;
  /** The login that signed in. Empty until /api/shell has answered once for a
   *  session that was migrated from a bare token. */
  email: string;
  displayName?: string | null;
  siteName?: string | null;
  addedAt: number;
  lastUsedAt: number;
  /** Epoch SECONDS from the bearer's own `exp`; null when it cannot be read;
   *  0 when the brain has refused the bearer and the session needs a sign-in. */
  tokenExpiresAt?: number | null;
};

export const SESSIONS_STORAGE_KEY = 'mantle_sessions';
export const ACTIVE_SESSION_STORAGE_KEY = 'mantle_active_session';
/** The active bearer's mirror. Contract: e2e/lib/contract.ts. */
export const TOKEN_STORAGE_KEY = 'mantle_token';

export function sessionTokenKey(id: string): string {
  return `${TOKEN_STORAGE_KEY}:${id}`;
}

function storage(): Storage | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  return window.localStorage;
}

// Private mode throws on ACCESS. A device that cannot persist its list must
// still be able to sign in for as long as the tab is open, so every touch of
// storage in this module goes through these and none of them throws.
function safeGet(ls: Storage, key: string): string | null {
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(ls: Storage, key: string, value: string): void {
  try {
    ls.setItem(key, value);
  } catch {
    /* not persisted */
  }
}
function safeRemove(ls: Storage, key: string): void {
  try {
    ls.removeItem(key);
  } catch {
    /* nothing to remove */
  }
}

function vault() {
  return typeof window !== 'undefined' ? (window.mantleDesktop?.tokenVault ?? null) : null;
}

/** The origin of the brain this page talks to: the configured API base, or the
 *  page's own origin on a same-origin box. */
export function currentBrainOrigin(): string {
  const base = runtimeApiBase();
  if (typeof window === 'undefined') return base;
  const here = window.location?.origin ?? '';
  if (!base) return here;
  try {
    return new URL(base, window.location.href).origin;
  } catch {
    return here;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function isSession(v: unknown): v is Session {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.origin === 'string' && typeof s.email === 'string';
}

function readList(): Session[] {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = safeGet(ls, SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // A list this module cannot read is treated as empty, never thrown on: the
    // mirror still holds the working bearer and `reconcile` rebuilds from it.
    return Array.isArray(parsed) ? parsed.filter(isSession) : [];
  } catch {
    return [];
  }
}

function writeList(list: Session[]): void {
  const ls = storage();
  if (ls) safeSet(ls, SESSIONS_STORAGE_KEY, JSON.stringify(list));
}

function readActiveId(): string | null {
  const ls = storage();
  return ls ? safeGet(ls, ACTIVE_SESSION_STORAGE_KEY) : null;
}

function sameLogin(a: { origin: string; email: string }, b: { origin: string; email: string }) {
  return a.origin === b.origin && a.email.toLowerCase() === b.email.toLowerCase();
}

/** Where the active bearer is read from: the vault in the shell, else the mirror. */
function readActiveBearer(): string | null {
  const v = vault();
  if (v) return v.get();
  const ls = storage();
  return ls ? safeGet(ls, TOKEN_STORAGE_KEY) : null;
}

/**
 * Bring the list in line with the bearer this device is actually holding.
 *
 * Three cases, one rule (the held bearer wins):
 *   - a bearer and no active session: the upgrade from the single slot, or the
 *     e2e suite seeding the mirror. It becomes a session at the current origin,
 *     its email filled in by the next /api/shell (`recordActiveIdentity`).
 *   - a bearer that differs from the active session's: another tab on an older
 *     build rotated it. The session adopts it.
 *   - no bearer: no active session either. A cookie-only login holds no
 *     bearer and is not a session until its next sign-in; it keeps working
 *     exactly as before.
 *
 * Cheap enough to run on every `tokenStore.get()`: a few reads when nothing moved.
 */
export function reconcile(): void {
  const ls = storage();
  if (!ls) return;
  try {
    const token = readActiveBearer();
    if (!token) {
      // An active session with no bearer behind it: a tab on an older build
      // signed out, clearing the only slot it knows. Honour that here too, or
      // the per-session copy would outlive the sign-out.
      if (readActiveId()) forgetActive(ls);
      return;
    }
    const activeId = readActiveId();
    const list = readList();
    const active = activeId ? list.find((s) => s.id === activeId) : undefined;
    if (active) {
      if (vault()) return; // the vault IS the session's bearer; nothing to compare
      if (safeGet(ls, sessionTokenKey(active.id)) === token) return;
      safeSet(ls, sessionTokenKey(active.id), token);
      active.tokenExpiresAt = tokenExpEpoch(token);
      writeList(list);
      return;
    }
    const now = Date.now();
    const session: Session = {
      id: newId(),
      origin: currentBrainOrigin(),
      email: '',
      addedAt: now,
      lastUsedAt: now,
      tokenExpiresAt: tokenExpEpoch(token),
    };
    if (!vault()) safeSet(ls, sessionTokenKey(session.id), token);
    writeList([...list, session]);
    safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, session.id);
  } catch {
    /* storage unavailable: the mirror alone still signs the person in */
  }
}

export function listSessions(): Session[] {
  reconcile();
  return readList();
}

export function activeSession(): Session | null {
  reconcile();
  const id = readActiveId();
  if (!id) return null;
  return readList().find((s) => s.id === id) ?? null;
}

/** A session's bearer, or null when it holds none (refused, or never stored). */
export function sessionToken(id: string): string | null {
  const ls = storage();
  if (!ls) return null;
  try {
    if (vault()) return readActiveId() === id ? readActiveBearer() : null;
    return safeGet(ls, sessionTokenKey(id));
  } catch {
    return null;
  }
}

/**
 * Store a bearer for a session: a rotation, or a sign-in. Mirrors it when the
 * session is the active one. Does not touch the presence cookie; that is the
 * token store's business.
 */
export function setSessionToken(id: string, token: string): void {
  const ls = storage();
  if (!ls) return;
  const list = readList();
  const session = list.find((s) => s.id === id);
  if (!session) return;
  const isActive = readActiveId() === id;
  const v = vault();
  if (v) {
    // One token per vault: only the active session can be backed.
    if (!isActive) return;
    v.set(token);
    safeRemove(ls, TOKEN_STORAGE_KEY);
  } else {
    safeSet(ls, sessionTokenKey(id), token);
    if (isActive) safeSet(ls, TOKEN_STORAGE_KEY, token);
  }
  session.tokenExpiresAt = tokenExpEpoch(token);
  writeList(list);
}

/**
 * A sign-in succeeded: hold it, and make it the active session.
 *
 * Signing in again as a login this device already holds refreshes that row
 * rather than adding a second one; the old bearer is simply replaced (the
 * brain still lists it as a device until it expires or is revoked there).
 */
export function signInSession(input: {
  email: string;
  token: string;
  origin?: string;
  displayName?: string | null;
  siteName?: string | null;
}): Session | null {
  const ls = storage();
  if (!ls) return null;
  const origin = input.origin ?? currentBrainOrigin();
  const now = Date.now();
  let list = readList();
  let session = list.find((s) => sameLogin(s, { origin, email: input.email }));
  if (session) {
    session.lastUsedAt = now;
  } else {
    session = { id: newId(), origin, email: input.email, addedAt: now, lastUsedAt: now };
    list.push(session);
  }
  if (input.displayName !== undefined) session.displayName = input.displayName;
  if (input.siteName !== undefined) session.siteName = input.siteName;
  if (vault()) {
    // The vault is about to hold this bearer and no other, so any other row is
    // a login this window can no longer back. Dropping it is honest; keeping
    // it would list a login that cannot be switched to.
    const keep = session;
    list = list.filter((s) => s === keep);
  }
  writeList(list);
  safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, session.id);
  setSessionToken(session.id, input.token);
  const id = session.id;
  return readList().find((s) => s.id === id) ?? null;
}

/** Fill in what /api/shell says about the active session. The migrated session
 *  learns its email here; every session keeps its names fresh. */
export function recordActiveIdentity(identity: {
  email?: string | null;
  displayName?: string | null;
  siteName?: string | null;
}): void {
  const ls = storage();
  if (!ls) return;
  try {
    reconcile();
    const id = readActiveId();
    if (!id) return;
    let list = readList();
    const session = list.find((s) => s.id === id);
    if (!session) return;
    const before = JSON.stringify(session);
    if (identity.email) session.email = identity.email;
    if (identity.displayName !== undefined) session.displayName = identity.displayName;
    if (identity.siteName !== undefined) session.siteName = identity.siteName;
    // A migrated session can turn out to be a login already listed without a
    // bearer (it was refused, then the person signed in on an older build).
    // Fold the dead row into this one instead of listing the login twice.
    const twins = list.filter((s) => s !== session && s.email !== '' && sameLogin(s, session));
    if (twins.length > 0) {
      for (const t of twins) safeRemove(ls, sessionTokenKey(t.id));
      session.addedAt = Math.min(session.addedAt, ...twins.map((t) => t.addedAt));
      list = list.filter((s) => !twins.includes(s));
    }
    if (twins.length > 0 || JSON.stringify(session) !== before) writeList(list);
  } catch {
    /* ignore */
  }
}

/**
 * The active session's bearer is gone (the brain refused it). Forget the
 * credential, keep the row: it still names a brain and a login, which is what
 * a "sign in again" screen needs. No other session is touched, and none is
 * made active: that is a switch, and a switch is a page load the caller owns.
 */
export function dropActiveCredential(): void {
  const ls = storage();
  if (!ls) return;
  // A bearer from the single-slot days that was never listed gets its row
  // first, so the refusal leaves something to sign back in to.
  reconcile();
  forgetActive(ls);
}

function forgetActive(ls: Storage): void {
  const id = readActiveId();
  vault()?.clear();
  safeRemove(ls, TOKEN_STORAGE_KEY);
  safeRemove(ls, ACTIVE_SESSION_STORAGE_KEY);
  if (!id) return;
  safeRemove(ls, sessionTokenKey(id));
  const list = readList();
  const session = list.find((s) => s.id === id);
  if (!session) return;
  // A row that never learned its login names nothing worth keeping.
  if (session.email === '') {
    writeList(list.filter((s) => s !== session));
    return;
  }
  session.tokenExpiresAt = 0;
  writeList(list);
}

/** Forget a session entirely: its row and its bearer. Revoking the bearer on
 *  its brain is the caller's job, and comes first. */
export function removeSession(id: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    if (readActiveId() === id) {
      vault()?.clear();
      safeRemove(ls, TOKEN_STORAGE_KEY);
      safeRemove(ls, ACTIVE_SESSION_STORAGE_KEY);
    }
    safeRemove(ls, sessionTokenKey(id));
    writeList(readList().filter((s) => s.id !== id));
  } catch {
    /* ignore */
  }
}
