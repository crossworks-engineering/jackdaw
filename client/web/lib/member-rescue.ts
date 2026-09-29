/**
 * A member's big autosave that a hard reload may cut off (audit B).
 *
 * A write that starts while the tab unloads only survives with `keepalive`,
 * and browsers cap a keepalive body at 64 KB. A page or table bigger than
 * that went out as a plain request and died with the page, taking the last
 * typing with it. So a big write is also kept here, in this browser, until
 * the brain answers; the next time the item opens, a kept write the brain
 * never answered is sent once before the item is read.
 *
 * Safe to send again: a draft write carries its `if_rev`, so a copy the brain
 * already holds (or that newer edits overtook) answers 409 and is dropped. A
 * note PATCH has no etag, so a kept write older than RESCUE_MAX_AGE_MS is
 * dropped unsent rather than laid over edits made since on another device.
 *
 * A kept write is a private draft at rest in a shared browser, so it belongs
 * to the login that wrote it: its key names that login (the OWNER, set by the
 * app shell once it knows who is signed in), only that login's writes are
 * ever sent, every kept write goes at sign-out (the sign-out registry), and
 * the app's boot sweeps out any that expired. Until the shell has said who is
 * signed in, nothing is kept and nothing is sent.
 */
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';

export const RESCUE_MAX_AGE_MS = 10 * 60_000;
const PREFIX = 'mantle_member_rescue:';

export type RescueEntry = { method: 'PUT' | 'PATCH'; body: string; at: number };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** Who this tab is signed in as (a member's login id, an admin's own name
 *  for their login), or null until the shell has said. */
let owner: string | null = null;
let ownerWaiters: ((who: string) => void)[] = [];

/** Set by the app shell from the shell it loaded; null at sign-out. */
export function setRescueOwner(who: string | null): void {
  owner = who || null;
  if (!owner) return;
  const waiters = ownerWaiters;
  ownerWaiters = [];
  for (const w of waiters) w(owner);
}

export function rescueOwner(): string | null {
  return owner;
}

/** The owner a loaded shell names: a member's login id, or an admin's own
 *  login (the actor's email; admins have no private space rescue across
 *  logins otherwise). Null until the shell has loaded. */
export function rescueOwnerFor(
  isMember: boolean,
  memberShell: { loginId?: string | null } | undefined,
  adminShell: { email?: string | null } | undefined,
): string | null {
  if (isMember) return memberShell?.loginId ? `member:${memberShell.loginId}` : null;
  if (!adminShell) return null;
  return `admin:${adminShell.email ?? ''}`;
}

/** The owner, once known, or null after `timeoutMs`. */
function ownerSoon(timeoutMs: number): Promise<string | null> {
  if (owner) return Promise.resolve(owner);
  return new Promise((resolve) => {
    const done = (who: string | null) => {
      clearTimeout(timer);
      ownerWaiters = ownerWaiters.filter((w) => w !== done);
      resolve(who);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    ownerWaiters.push(done);
  });
}

const keyFor = (who: string, path: string) => `${PREFIX}${encodeURIComponent(who)}:${path}`;

/** Every kept-write key in the store (any owner, any format). */
function rescueKeys(s: Store): string[] {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keep a write until the brain answers it. Storage full or blocked, or no
 *  owner known yet: skip. */
export function keepRescue(
  path: string,
  entry: RescueEntry,
  s: Store | null = store(),
  who: string | null = owner,
): void {
  if (!who) return;
  try {
    s?.setItem(keyFor(who, path), JSON.stringify(entry));
  } catch {
    // Quota or blocked storage: the write simply has no rescue copy.
  }
}

export function dropRescue(
  path: string,
  s: Store | null = store(),
  who: string | null = owner,
): void {
  if (!who) return;
  try {
    s?.removeItem(keyFor(who, path));
  } catch {
    // Nothing to do.
  }
}

/** A kept write worth sending at `now`, else null. */
function readEntry(raw: string, now: number): RescueEntry | null {
  try {
    const e = JSON.parse(raw) as RescueEntry;
    if ((e.method !== 'PUT' && e.method !== 'PATCH') || typeof e.body !== 'string') return null;
    if (typeof e.at !== 'number' || now - e.at > RESCUE_MAX_AGE_MS) return null;
    return e;
  } catch {
    return null;
  }
}

/** The owner's kept write for `path` when it is still worth sending, else
 *  null (an unreadable or too old one is dropped). */
export function takeRescue(
  path: string,
  now: number,
  s: Store | null = store(),
  who: string | null = owner,
): RescueEntry | null {
  if (!who) return null;
  let raw: string | null;
  try {
    raw = s?.getItem(keyFor(who, path)) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  dropRescue(path, s, who);
  return readEntry(raw, now);
}

/** Is any login's write for one of `paths` kept here? (Cheap: no parsing.) */
function anyKeptFor(paths: readonly string[], s: Store | null): boolean {
  if (!s) return false;
  try {
    return rescueKeys(s).some((k) => paths.some((p) => k.endsWith(`:${p}`)));
  } catch {
    return false;
  }
}

/** At boot: drop every kept write that expired, is unreadable, or predates
 *  the owner in the key (anyone's; none of it can be sent any more). */
export function sweepRescues(now: number, s: Store | null = store()): void {
  if (!s) return;
  try {
    for (const k of rescueKeys(s)) {
      const rest = k.slice(PREFIX.length);
      const raw = s.getItem(k);
      // The owner-less format (`<prefix>/api/...`) has no owner to send it as.
      if (rest.startsWith('/') || !raw || !readEntry(raw, now)) s.removeItem(k);
    }
  } catch {
    // Blocked storage: nothing kept, nothing to sweep.
  }
}

/** At sign-out: every kept write, whoever wrote it. */
export function clearRescues(s: Store | null = store()): void {
  if (!s) return;
  try {
    for (const k of rescueKeys(s)) s.removeItem(k);
  } catch {
    // Nothing to do.
  }
}

/** A space's route base (SpaceApiBase in member-space.ts, spelled out here:
 *  that module imports this one). */
type RescueBase = '/api/member' | '/api/admin' | '/api/client';

/** The paths an item's autosave writes to (see spaceClient in
 *  member-space.ts): a member's space, or an admin's private one. */
export const rescuePaths = (id: string, base: RescueBase = '/api/member') => [
  `${base}/space/${id}/draft`,
  `${base}/space/${id}`,
];

/**
 * Send what a reload cut off for this item, once, before it is read. Never
 * throws and never sends the browser to sign in: whatever the brain answers,
 * the kept copy is gone after this.
 */
export async function replayRescue(
  id: string,
  now = Date.now(),
  base: RescueBase = '/api/member',
): Promise<void> {
  const paths = rescuePaths(id, base);
  // Nearly always nothing is kept: open the item at once.
  if (!anyKeptFor(paths, store())) return;
  // Something is: send it only as the login that wrote it, once the shell
  // has said who that is (a deep link can open an item before it has).
  const who = await ownerSoon(5000);
  if (!who) return;
  for (const path of paths) {
    const e = takeRescue(path, now, store(), who);
    if (!e) continue;
    try {
      await fetch(
        apiUrl(path),
        withAuth({
          method: e.method,
          headers: { 'content-type': 'application/json' },
          body: e.body,
        }),
      );
    } catch {
      // Offline: the typing is lost as it was before; nothing to retry into.
    }
  }
}
