'use client';

import { useEffect, useState } from 'react';
import {
  activeSession,
  canHoldSeveralLogins,
  listSessions,
  SESSIONS_CHANGED_EVENT,
  sessionToken,
  type Session,
} from './session-registry';

export type HeldSession = Session & {
  active: boolean;
  /** False once its brain has refused the bearer: it can be signed back in
   *  to, not switched to. */
  hasToken: boolean;
};

export type HeldSessions = {
  /** False until the first read after mount. The list lives in localStorage,
   *  which the server pass cannot see, so rendering it during hydration would
   *  be a mismatch; callers render nothing about sessions until this is true. */
  ready: boolean;
  sessions: HeldSession[];
  active: HeldSession | null;
  /** False inside the desktop shell, for now. See `canHoldSeveralLogins`. */
  canHoldSeveral: boolean;
};

function read(): HeldSessions {
  const activeId = activeSession()?.id ?? null;
  const sessions = listSessions()
    .map((s) => ({ ...s, active: s.id === activeId, hasToken: sessionToken(s.id) !== null }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.lastUsedAt - a.lastUsedAt);
  return {
    ready: true,
    sessions,
    active: sessions.find((s) => s.active) ?? null,
    canHoldSeveral: canHoldSeveralLogins(),
  };
}

/** The logins this device holds, live: this tab's changes and other tabs'. */
export function useSessions(): HeldSessions {
  const [state, setState] = useState<HeldSessions>({
    ready: false,
    sessions: [],
    active: null,
    canHoldSeveral: false,
  });
  useEffect(() => {
    const update = () => setState(read());
    update();
    window.addEventListener(SESSIONS_CHANGED_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(SESSIONS_CHANGED_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return state;
}
