import { apiUrl, resetCookieUpgrade } from './api-fetch';
import { setAssetToken } from './asset-url';
import { isCrossOrigin } from './runtime-env';
import { runSessionFlushes } from './session-flush';
import {
  activeSession,
  currentBrainOrigin,
  listSessions,
  markSessionRefused,
  removeSession,
  sessionToken,
  setActiveSession,
  type Session,
} from './session-registry';
import { runSignOutResets } from './session-reset';
import { performSignOut } from './sign-out';
import { tokenStore } from './token-store';

/**
 * Moving between the logins a device holds.
 *
 * A switch is not a token swap with a redraw. Everything this tab knows was
 * learned as the login being left: the query cache, the asset token, the memo
 * saying the cookie upgrade already ran, and on a same-origin box the session
 * cookie every `<img>` and download authenticates with. sign-out.ts documents
 * what happens when a client navigation carries that heap across a change of
 * person: the next one is painted the last one's data. So a switch forgets
 * what it can reach, and then ENDS IN A PAGE LOAD, which forgets the rest.
 *
 * The order is the design:
 *   1. Ask the brain whether the login being switched TO is still good, with
 *      its own bearer and nothing else. A refusal marks that session and
 *      leaves the one in use untouched; so does a brain that cannot be
 *      reached. Nothing is given up before there is something to move to.
 *   2. Let every draft editor save, as the 401 bounce does. They save as the
 *      login that wrote them, so this comes before the credential changes.
 *   3. Make the session active (its bearer becomes `mantle_token`).
 *   4. Same-origin only: drop the old login's cookie, then trade the new
 *      bearer for a cookie. The upgrade resolves a cookie BEFORE a bearer, so
 *      in the other order it would renew the login being left.
 *   5. Load the app.
 */

export type SwitchOutcome =
  /** The page is about to reload as the other login. */
  | 'switched'
  /** Its brain refused the bearer. The row is kept, marked, and the caller
   *  sends the person to sign in to it again. */
  | 'needs-sign-in'
  /** Its brain did not answer. Nothing changed. */
  | 'unreachable'
  /** Held for a brain this client is not talking to. Nothing changed. */
  | 'other-brain'
  /** No such session, or this client cannot switch (the desktop shell's vault
   *  backs one login per window). Nothing changed. */
  | 'unavailable';

/** Where to send someone to sign back in to a login the device still lists. */
export function signInAgainPath(id: string): string {
  return `/login?add=1&session=${encodeURIComponent(id)}`;
}

/** The held logins that can be switched to right now, most recently used first. */
export function switchableSessions(): Session[] {
  const active = activeSession()?.id ?? null;
  const here = currentBrainOrigin();
  return listSessions()
    .filter((s) => s.id !== active && s.origin === here && sessionToken(s.id) !== null)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

async function probe(token: string): Promise<'ok' | 'refused' | 'unreachable'> {
  try {
    const res = await fetch(apiUrl('/api/shell'), {
      headers: { Authorization: `Bearer ${token}` },
      // The bearer alone: a cookie would answer for the login in use and make
      // a dead bearer look alive.
      credentials: 'omit',
    });
    if (res.status === 401) return 'refused';
    return res.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

async function moveCookieTo(token: string): Promise<void> {
  if (isCrossOrigin()) return; // split client: the bearer is the whole credential
  try {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    await fetch(apiUrl('/api/auth/sso'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
  } catch {
    /* the shell's own upgrade retries on the load that follows */
  }
}

export async function switchSession(id: string, to: string = '/'): Promise<SwitchOutcome> {
  const session = listSessions().find((s) => s.id === id);
  if (!session) return 'unavailable';
  if (session.origin !== currentBrainOrigin()) return 'other-brain';
  const token = sessionToken(id);
  if (!token) return 'needs-sign-in';

  const state = await probe(token);
  if (state === 'refused') {
    markSessionRefused(id);
    return 'needs-sign-in';
  }
  if (state === 'unreachable') return 'unreachable';

  await runSessionFlushes();
  if (!setActiveSession(id)) return 'unavailable';
  // A sign-out on the way here expired it, and without it the client
  // middleware answers the load below with a redirect to /login.
  tokenStore.markPresence();
  setAssetToken(null);
  resetCookieUpgrade();
  runSignOutResets();
  await moveCookieTo(token);
  window.location.assign(to);
  return 'switched';
}

/**
 * Sign out of the login in use, and land somewhere sensible: on the most
 * recently used other login this device holds, or on the sign-in screen
 * (`signInPath`: a client login's is its own page). "Sign out" keeps its
 * meaning, this login only; the others are why the landing differs. Always
 * ends in a page load.
 */
export async function signOutActive(signInPath: string = '/login'): Promise<void> {
  await performSignOut();
  for (const next of switchableSessions()) {
    if ((await switchSession(next.id)) === 'switched') return;
  }
  window.location.assign(signInPath);
}

/**
 * Sign out of a held login: revoke its bearer on its brain, then forget it.
 * The forgetting happens whatever the network did, as in `performSignOut`: a
 * person who asked for a login to leave this device must not find it still
 * listed because a brain was down.
 */
export async function signOutSession(id: string): Promise<void> {
  if (activeSession()?.id === id) return signOutActive();
  const session = listSessions().find((s) => s.id === id);
  const token = sessionToken(id);
  if (session && token) {
    try {
      await fetch(`${session.origin}/api/auth/mobile-logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'omit',
      });
    } catch {
      /* unreachable: the bearer dies at its own expiry, or from the brain's device list */
    }
  }
  removeSession(id);
}

/** Drop a login from this device WITHOUT telling its brain: for a brain that
 *  is gone. Its bearer stays valid there until it expires or is revoked from
 *  that brain's own device list, which is what the screen says. */
export async function forgetSession(id: string): Promise<void> {
  const wasActive = activeSession()?.id === id;
  removeSession(id);
  if (!wasActive) return;
  tokenStore.clear(); // the presence cookie
  if (!isCrossOrigin()) {
    // The cookie only. Sent without the bearer, so nothing is revoked.
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' }).catch(
      () => undefined,
    );
  }
  setAssetToken(null);
  resetCookieUpgrade();
  runSignOutResets();
  for (const next of switchableSessions()) {
    if ((await switchSession(next.id)) === 'switched') return;
  }
  window.location.assign('/login');
}
