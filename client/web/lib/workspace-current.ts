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

/** No storage at all (its accessor threw, or the server renders). */
const NO_STORE: object = {};

/**
 * The picks a storage refused (full, or blocked), by storage and key: they
 * hold for this page and win over what the storage still has. Without them a
 * refused write left the switcher on its old choice, so a switch did nothing
 * (dev-brain task fc3b47ed). A write the storage takes drops the entry.
 */
const refused = new WeakMap<object, Map<string, string | null>>();

/** The stored choice, or null. Never throws (a blocked storage is null). */
export function readCurrentWorkspace(
  login: string | null | undefined,
  store = storage(),
): string | null {
  const key = currentWorkspaceStorageKey(login);
  const held = refused.get(store ?? NO_STORE);
  if (held?.has(key)) return held.get(key) ?? null;
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Keep a choice (null forgets it) and tell every reader. A storage that
 *  refuses it keeps it for this page only. */
export function writeCurrentWorkspace(
  login: string | null | undefined,
  id: string | null,
  store = storage(),
): void {
  const key = currentWorkspaceStorageKey(login);
  const ref = store ?? NO_STORE;
  try {
    if (!store) throw new Error('no storage');
    if (id) store.setItem(key, id);
    else store.removeItem(key);
    refused.get(ref)?.delete(key);
  } catch {
    const held = refused.get(ref) ?? new Map<string, string | null>();
    held.set(key, id || null);
    refused.set(ref, held);
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
