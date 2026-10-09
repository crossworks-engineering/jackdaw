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
 * Inside the desktop shell no bearer is ever written to localStorage: they live
 * in the shell's OS-keychain-backed vault, one per login (`getFor` / `setFor`),
 * and there is no mirror, because the vault answers for the active login
 * directly. A shell from before it learned that holds one bearer per brain
 * window, so there the list holds the one session that slot can back. The
 * first run after the shell update ADOPTS the one-slot bearer into the login
 * it belongs to (a rename, in the shell), so the update signs nobody out.
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
  /** What the brain said this login is, when the sign-in said: a client
   *  login's code sign-in names it (`role: "client"`), the password sign-in
   *  does not. Absent means "ask the brain" (the shells do on every load). */
  role?: SessionRole | null;
  /** The brain's id for the login, when the sign-in said. Not a secret. */
  loginId?: string | null;
};

export type SessionRole = 'admin' | 'member' | 'client';

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

type TokenVault = NonNullable<ReturnType<typeof vault>>;
type ScopedVault = TokenVault & Required<Pick<TokenVault, 'getFor' | 'setFor' | 'clearFor'>>;

/** The vault, when the shell can keep one bearer per login. */
function scopedVault(): ScopedVault | null {
  const v = vault();
  return v && v.getFor && v.setFor && v.clearFor ? (v as ScopedVault) : null;
}

/** A vault with ONE slot per brain window: a shell from before per-login slots. */
function oneSlotVault(): TokenVault | null {
  return scopedVault() ? null : vault();
}

// ── Where a bearer lives ─────────────────────────────────────────────────────
// Three homes, one set of verbs. Everything below this block asks these and
// never touches a vault or a token key itself.
//   browser        mantle_token:<id>, and mantle_token mirrors the active one
//   scoped vault   the shell's per-login slot; nothing in localStorage
//   one-slot vault the shell's single slot, which only the ACTIVE login can use

function bearerGet(ls: Storage, id: string, isActive: boolean): string | null {
  const scoped = scopedVault();
  if (scoped) return scoped.getFor(id);
  const one = oneSlotVault();
  if (one) return isActive ? one.get() : null;
  return safeGet(ls, sessionTokenKey(id));
}

/** False when it could not be stored: an idle login in a one-slot shell. */
function bearerSet(ls: Storage, id: string, token: string, isActive: boolean): boolean {
  const scoped = scopedVault();
  if (scoped) {
    scoped.setFor(id, token);
    safeRemove(ls, TOKEN_STORAGE_KEY);
    return true;
  }
  const one = oneSlotVault();
  if (one) {
    if (!isActive) return false;
    one.set(token);
    safeRemove(ls, TOKEN_STORAGE_KEY);
    return true;
  }
  safeSet(ls, sessionTokenKey(id), token);
  if (isActive) safeSet(ls, TOKEN_STORAGE_KEY, token);
  return true;
}

function bearerRemove(ls: Storage, id: string, isActive: boolean): void {
  const scoped = scopedVault();
  if (scoped) scoped.clearFor(id);
  else if (isActive) oneSlotVault()?.clear();
  safeRemove(ls, sessionTokenKey(id));
  if (isActive) safeRemove(ls, TOKEN_STORAGE_KEY);
}

/** Where to send someone to sign back in to a login the device still lists:
 *  the Add login screen, which finds the row by id, fills in its email, opens
 *  the right form for its role, and signs in INTO that row (`signInSession`
 *  matches the same brain and email) rather than listing the login twice. */
export function signInAgainPath(id: string): string {
  return `/login?add=1&session=${encodeURIComponent(id)}`;
}

/** Can this client hold more than one login? Not inside a desktop shell from
 *  before per-login vault slots: its vault backs one bearer per brain window,
 *  so a second sign-in there REPLACES the first. Screens hide "add" and "switch" on a false rather than
 *  offer something that quietly costs the person the login they had. */
export function canHoldSeveralLogins(): boolean {
  return typeof window !== 'undefined' && oneSlotVault() === null;
}

/**
 * Can this client hold a CLIENT login as one of its logins? Only the desktop
 * shell with per-login vault slots. A client login has no password; its
 * bearer comes from the brain's device sign-in (an emailed code), which the
 * brain refuses to any web page (it answers 403 `device-only` to a request
 * carrying `Origin` or `Sec-Fetch-*`), so a client's credential never sits
 * where page script in a browser could read it. The desktop shell talks to
 * its brain as a native client (it drops those headers, brain-fence.ts) and
 * keeps the bearer in the OS keychain. A browser keeps clients cookie-only.
 */
export function canHoldClientLogins(): boolean {
  return scopedVault() !== null;
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

/** Fired on `window` whenever the list changes in THIS tab. `storage` only
 *  fires in the others, so a screen listing the logins listens to both. */
export const SESSIONS_CHANGED_EVENT = 'mantle:sessions';

/**
 * Write the list, then tell this tab's listeners. The event is dispatched
 * synchronously, and a listener reads the list straight back (`useSessions`),
 * which reconciles. So every writer here stores the active id and the bearer
 * FIRST and the list LAST: a listener must never see a list that is newer than
 * the active id beside it, or it lists the held bearer a second time.
 */
function writeList(list: Session[]): void {
  const ls = storage();
  if (!ls) return;
  safeSet(ls, SESSIONS_STORAGE_KEY, JSON.stringify(list));
  notifyChanged();
}

function notifyChanged(): void {
  try {
    window.dispatchEvent?.(new Event(SESSIONS_CHANGED_EVENT));
  } catch {
    /* no event target (tests, old shells): listeners are a nicety */
  }
}

function readActiveId(): string | null {
  const ls = storage();
  return ls ? safeGet(ls, ACTIVE_SESSION_STORAGE_KEY) : null;
}

function sameLogin(a: { origin: string; email: string }, b: { origin: string; email: string }) {
  return a.origin === b.origin && a.email.toLowerCase() === b.email.toLowerCase();
}

/**
 * The bearer this device is actually holding for the login in use.
 *
 * In the scoped shell that is the active login's own slot, and when that is
 * empty, the one slot an earlier build wrote, ADOPTED into it on the spot. With
 * no active login yet, the one slot is read as it is: `reconcile` is about to
 * list it and adopt it under the id it mints.
 */
function readActiveBearer(): string | null {
  const scoped = scopedVault();
  if (scoped) {
    const id = readActiveId();
    if (!id) return scoped.get();
    return scoped.getFor(id) ?? scoped.adopt?.(id) ?? null;
  }
  const v = vault();
  if (v) return v.get();
  const ls = storage();
  return ls ? safeGet(ls, TOKEN_STORAGE_KEY) : null;
}

/** Hand the one-slot bearer to a freshly listed login. */
function adoptInto(scoped: ScopedVault, id: string, token: string): void {
  if (scoped.adopt?.(id)) return;
  // A shell with slots but no adopt: copy, then empty the one slot.
  scoped.setFor(id, token);
  scoped.clear();
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
  // Not re-entrant. Writing the list fires SESSIONS_CHANGED_EVENT, whose
  // listeners read the list and land back here mid-write. Unguarded, that
  // inner call saw a bearer with no active row and listed it again, whose write
  // fired the event again: one sign-in became dozens of nameless rows in a
  // single burst, each with its own copy of the same bearer.
  if (reconciling) return;
  const ls = storage();
  if (!ls) return;
  reconciling = true;
  try {
    if (!repaired) {
      repaired = true;
      repairList(ls);
    }
    reconcileList(ls);
  } catch {
    /* storage unavailable: the mirror alone still signs the person in */
  } finally {
    reconciling = false;
  }
}

let reconciling = false;
/** Once per page load: see `repairList`. */
let repaired = false;

function reconcileList(ls: Storage): void {
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
  // The bearer may be listed already, under an active id this tab has not
  // seen: another tab listed it a moment ago, or two tabs raced and the last
  // list written is not the one the active id came from. That row is the
  // session. A bearer is never listed twice.
  const holder = rowHolding(ls, list, token);
  if (holder) {
    safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, holder.id);
    // The scoped shell read the bearer from its one slot; the row has its own.
    scopedVault()?.clear();
    notifyChanged();
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
  // Active id and bearer first, the list last (see `writeList`).
  safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, session.id);
  const scoped = scopedVault();
  if (scoped) adoptInto(scoped, session.id, token);
  else if (!vault()) safeSet(ls, sessionTokenKey(session.id), token);
  writeList([...list, session]);
}

/** The listed row that holds this bearer, where rows hold their own: the
 *  browser and the scoped shell. A one-slot shell backs only the active row. */
function rowHolding(ls: Storage, list: Session[], token: string): Session | undefined {
  if (oneSlotVault()) return undefined;
  return list.find((s) => bearerGet(ls, s.id, false) === token);
}

/**
 * Undo what the re-entrant burst left behind (see `reconcile`), once per page
 * load, before anything reads the list:
 *   - a row with no login whose bearer another row also holds is a copy. The
 *     row that keeps the bearer is the one with a login, else the active one,
 *     else the first listed. A row is never dropped when it is the only holder
 *     of its bearer, and a row with a login is never dropped at all.
 *   - a row with no login and no bearer names nothing (`forgetActive` drops
 *     those as they happen), unless it is the active one.
 *   - a `mantle_token:<id>` with no row is an orphan, unless it is the active
 *     id's: a tab mid-way through listing a bearer writes those two first.
 */
function repairList(ls: Storage): void {
  if (oneSlotVault()) return; // one row by design, and idle rows hold nothing
  let activeId = readActiveId();
  const list = readList();
  const bearerOf = new Map(list.map((s) => [s.id, bearerGet(ls, s.id, s.id === activeId)]));
  const holders = new Map<string, Session[]>();
  for (const s of list) {
    const b = bearerOf.get(s.id);
    if (b) holders.set(b, [...(holders.get(b) ?? []), s]);
  }
  const drop = new Set<Session>();
  for (const rows of holders.values()) {
    if (rows.length < 2) continue;
    const keep =
      rows.find((s) => s.email !== '') ?? rows.find((s) => s.id === activeId) ?? rows[0]!;
    for (const s of rows) if (s !== keep && s.email === '') drop.add(s);
    if (activeId && rows.some((s) => s.id === activeId && drop.has(s))) {
      activeId = keep.id;
      safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, keep.id);
    }
  }
  for (const s of list) {
    if (s.email === '' && !bearerOf.get(s.id) && s.id !== activeId) drop.add(s);
  }
  for (const s of drop) bearerRemove(ls, s.id, false);
  const kept = list.filter((s) => !drop.has(s));
  if (drop.size > 0) writeList(kept);
  removeOrphanBearers(ls, new Set(kept.map((s) => s.id)), activeId);
}

function removeOrphanBearers(ls: Storage, listed: Set<string>, activeId: string | null): void {
  const prefix = `${TOKEN_STORAGE_KEY}:`;
  try {
    if (typeof ls.key !== 'function') return;
    const orphans: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (!listed.has(id) && id !== activeId) orphans.push(key);
    }
    for (const key of orphans) safeRemove(ls, key);
  } catch {
    /* a storage that cannot be walked keeps its orphans */
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
    return bearerGet(ls, id, readActiveId() === id);
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
  // A one-slot shell can back the active login and no other.
  if (!bearerSet(ls, id, token, readActiveId() === id)) return;
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
  role?: SessionRole | null;
  loginId?: string | null;
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
  if (input.role !== undefined) session.role = input.role;
  if (input.loginId !== undefined) session.loginId = input.loginId;
  if (oneSlotVault()) {
    // The one slot is about to hold this bearer and no other, so any other row
    // is a login this window can no longer back. Dropping it is honest; keeping
    // it would list a login that cannot be switched to.
    const keep = session;
    list = list.filter((s) => s === keep);
  }
  // Active id and bearer first, the list last (see `writeList`).
  safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, session.id);
  bearerSet(ls, session.id, input.token, true);
  session.tokenExpiresAt = tokenExpEpoch(input.token);
  writeList(list);
  const id = session.id;
  return readList().find((s) => s.id === id) ?? null;
}

/**
 * Make a held login the active one: its bearer becomes `mantle_token`. That is
 * ALL this does. Everything a switch also has to forget (the query cache, the
 * asset token, the other login's cookie) and the page load that follows belong
 * to `switchSession` in session-switch.ts, which is what screens call.
 *
 * False when it cannot be done: an unknown id, a session holding no bearer, or
 * a desktop shell whose vault still backs one login per window.
 */
export function setActiveSession(id: string): boolean {
  const ls = storage();
  if (!ls || oneSlotVault()) return false;
  const list = readList();
  const session = list.find((s) => s.id === id);
  const token = bearerGet(ls, id, false);
  if (!session || !token) return false;
  session.lastUsedAt = Date.now();
  safeSet(ls, ACTIVE_SESSION_STORAGE_KEY, id);
  // The browser mirrors the active bearer; the scoped vault has no mirror,
  // because it answers for whichever login is active.
  if (!vault()) safeSet(ls, TOKEN_STORAGE_KEY, token);
  writeList(list);
  return true;
}

/** A brain refused a login that is NOT the active one (a switch probed it).
 *  Same outcome as `dropActiveCredential`, for a session at rest. */
export function markSessionRefused(id: string): void {
  const ls = storage();
  if (!ls) return;
  if (readActiveId() === id) {
    dropActiveCredential();
    return;
  }
  bearerRemove(ls, id, false);
  const list = readList();
  const session = list.find((s) => s.id === id);
  if (!session) return;
  session.tokenExpiresAt = 0;
  writeList(list);
}

/** Fill in what /api/shell says about the active session. The migrated session
 *  learns its email here; every session keeps its names fresh. */
export function recordActiveIdentity(identity: {
  email?: string | null;
  displayName?: string | null;
  siteName?: string | null;
  /** Which shell answered for it: the role, as the brain sees this login. */
  role?: SessionRole | null;
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
    if (identity.role) session.role = identity.role;
    // A migrated session can turn out to be a login already listed without a
    // bearer (it was refused, then the person signed in on an older build).
    // Fold the dead row into this one instead of listing the login twice. A
    // row with no login that holds this same bearer is this session too.
    const held = bearerGet(ls, id, true);
    const twins = list.filter(
      (s) =>
        s !== session &&
        (s.email !== ''
          ? sameLogin(s, session)
          : held !== null && bearerGet(ls, s.id, false) === held),
    );
    if (twins.length > 0) {
      for (const t of twins) bearerRemove(ls, t.id, false);
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
  // The one slot too, whatever kind of vault: with no active login it is
  // where a bearer nobody has listed yet would be sitting.
  vault()?.clear();
  safeRemove(ls, TOKEN_STORAGE_KEY);
  safeRemove(ls, ACTIVE_SESSION_STORAGE_KEY);
  if (!id) return;
  bearerRemove(ls, id, true);
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

/**
 * Sign-out's forgetting: the active session's row and bearer, and every other
 * row holding that same bearer. Such a row is a copy of this login (see
 * `reconcile`), and left behind it would be "the next login held here": a
 * sign-out would probe the bearer it had just revoked, once per copy, and
 * leave each one listed as signed out.
 */
export function removeActiveSession(): void {
  const ls = storage();
  if (!ls) return;
  try {
    reconcile();
    const id = readActiveId();
    if (!id) return;
    const held = bearerGet(ls, id, true);
    const gone = new Set([id]);
    if (held) {
      for (const s of readList()) if (bearerGet(ls, s.id, false) === held) gone.add(s.id);
    }
    for (const g of gone) bearerRemove(ls, g, g === id);
    safeRemove(ls, ACTIVE_SESSION_STORAGE_KEY);
    writeList(readList().filter((s) => !gone.has(s.id)));
  } catch {
    /* ignore */
  }
}

/** Forget a session entirely: its row and its bearer. Revoking the bearer on
 *  its brain is the caller's job, and comes first. */
export function removeSession(id: string): void {
  const ls = storage();
  if (!ls) return;
  try {
    const wasActive = readActiveId() === id;
    bearerRemove(ls, id, wasActive);
    if (wasActive) safeRemove(ls, ACTIVE_SESSION_STORAGE_KEY);
    writeList(readList().filter((s) => s.id !== id));
  } catch {
    /* ignore */
  }
}
