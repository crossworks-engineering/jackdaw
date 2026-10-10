/**
 * The switcher's current workspace: a per-login preference kept in this
 * browser (plan 7.1). In W5a it changes nothing but the switcher's own label;
 * W5b makes the lists follow it. Both copies of the switcher (the rail and
 * the phone bar) read one store, so a change in one shows in the other.
 *
 * Keyed by login: two logins held in one browser keep their own choice.
 */
import { useCallback, useSyncExternalStore } from 'react';

const PREFIX = 'jackdaw.workspace.current:';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const listeners = new Set<() => void>();

function storage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function currentWorkspaceStorageKey(login: string | null | undefined): string {
  return `${PREFIX}${login?.trim().toLowerCase() || 'me'}`;
}

/** The stored choice, or null. Never throws (a blocked storage is null). */
export function readCurrentWorkspace(
  login: string | null | undefined,
  store = storage(),
): string | null {
  try {
    return store?.getItem(currentWorkspaceStorageKey(login)) ?? null;
  } catch {
    return null;
  }
}

/** Keep a choice (null forgets it) and tell every reader. */
export function writeCurrentWorkspace(
  login: string | null | undefined,
  id: string | null,
  store = storage(),
): void {
  try {
    const key = currentWorkspaceStorageKey(login);
    if (id) store?.setItem(key, id);
    else store?.removeItem(key);
  } catch {
    // A blocked storage keeps the choice for this page only: nothing to do.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stored choice for this login and a setter. Null while the server
 *  renders (it has no storage). */
export function useCurrentWorkspace(
  login: string | null | undefined,
): [string | null, (id: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readCurrentWorkspace(login),
    () => null,
  );
  const set = useCallback((id: string | null) => writeCurrentWorkspace(login, id), [login]);
  return [value, set];
}
