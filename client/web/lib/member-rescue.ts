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
 */
import { apiUrl, withAuth } from '@mantle/web-ui/api-fetch';

export const RESCUE_MAX_AGE_MS = 10 * 60_000;
const PREFIX = 'mantle_member_rescue:';

export type RescueEntry = { method: 'PUT' | 'PATCH'; body: string; at: number };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Keep a write until the brain answers it. Storage full or blocked: skip. */
export function keepRescue(path: string, entry: RescueEntry, s: Store | null = store()): void {
  try {
    s?.setItem(PREFIX + path, JSON.stringify(entry));
  } catch {
    // Quota or blocked storage: the write simply has no rescue copy.
  }
}

export function dropRescue(path: string, s: Store | null = store()): void {
  try {
    s?.removeItem(PREFIX + path);
  } catch {
    // Nothing to do.
  }
}

/** The kept write for `path` when it is still worth sending, else null (an
 *  unreadable or too old one is dropped). */
export function takeRescue(
  path: string,
  now: number,
  s: Store | null = store(),
): RescueEntry | null {
  let raw: string | null;
  try {
    raw = s?.getItem(PREFIX + path) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  dropRescue(path, s);
  try {
    const e = JSON.parse(raw) as RescueEntry;
    if ((e.method !== 'PUT' && e.method !== 'PATCH') || typeof e.body !== 'string') return null;
    if (typeof e.at !== 'number' || now - e.at > RESCUE_MAX_AGE_MS) return null;
    return e;
  } catch {
    return null;
  }
}

/** The paths an item's autosave writes to (see memberSpace in member-space.ts). */
export const rescuePaths = (id: string) => [
  `/api/member/space/${id}/draft`,
  `/api/member/space/${id}`,
];

/**
 * Send what a reload cut off for this item, once, before it is read. Never
 * throws and never sends the browser to sign in: whatever the brain answers,
 * the kept copy is gone after this.
 */
export async function replayRescue(id: string, now = Date.now()): Promise<void> {
  for (const path of rescuePaths(id)) {
    const e = takeRescue(path, now);
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
