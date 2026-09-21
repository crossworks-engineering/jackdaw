import { apiUrl, withAuth } from './api-fetch';
import {
  activeSession,
  listSessions,
  sessionToken,
  setSessionToken,
  type Session,
} from './session-registry';
import { tokenExpEpoch } from './token-claims';
import { tokenStore } from './token-store';

/** Days-left threshold under which the shell rotates a bearer. */
const REFRESH_UNDER_SECONDS = 7 * 24 * 60 * 60;

function dueForRefresh(token: string): boolean {
  const exp = tokenExpEpoch(token);
  if (exp === null) return false;
  return exp - Date.now() / 1000 <= REFRESH_UNDER_SECONDS;
}

/**
 * Opportunistic bearer rotation — called from the app shell's boot path (it
 * already round-trips /api/shell). No-op unless a stored web bearer exists
 * AND expires within 7 days: an active browser therefore never expires; an
 * idle one dies at the 30-day TTL. Failures are swallowed — the current
 * token keeps working until its real expiry, and the next boot retries.
 */
export async function maybeRefreshToken(): Promise<void> {
  const token = tokenStore.get();
  if (!token) return;
  if (!dueForRefresh(token)) return;
  try {
    const res = await fetch(apiUrl('/api/auth/token/refresh'), withAuth({ method: 'POST' }));
    if (!res.ok) return;
    const body = (await res.json()) as { token?: string };
    if (body.token) tokenStore.set(body.token);
  } catch {
    /* network hiccup — retry on next shell boot */
  }
}

/** Rotate one session that is NOT the active one, against its own brain. */
async function refreshIdleSession(session: Session): Promise<void> {
  const token = sessionToken(session.id);
  if (!token || !dueForRefresh(token)) return;
  try {
    const res = await fetch(`${session.origin}/api/auth/token/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      // Never a cookie: on this brain it belongs to the ACTIVE login, and on
      // another brain the CORS reflection carries no Allow-Credentials.
      credentials: 'omit',
    });
    if (!res.ok) return;
    const body = (await res.json()) as { token?: string };
    // Only if nothing replaced it while the request was in flight.
    if (body.token && sessionToken(session.id) === token) setSessionToken(session.id, body.token);
  } catch {
    /* unreachable brain, or one that does not allow this origin — next boot retries */
  }
}

/**
 * Keep every login on this device alive, not only the one in use. Without
 * this a second login would die at its 30-day TTL while the app was open every
 * day, and "switch without signing in again" would quietly stop being true.
 *
 * The active session goes through `maybeRefreshToken` unchanged. The rest are
 * rotated against their own origin with their own bearer, each on its own:
 * one brain being down says nothing about the others.
 */
export async function refreshAllSessions(): Promise<void> {
  await maybeRefreshToken();
  const activeId = activeSession()?.id ?? null;
  const idle = listSessions().filter((s) => s.id !== activeId);
  await Promise.all(idle.map(refreshIdleSession));
}
