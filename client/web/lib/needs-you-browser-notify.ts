'use client';

/**
 * The browser-notification opt-in for "needs you" (per browser: the
 * browser's permission is per site and per device). Off until the admin
 * turns it on in the profile menu, and only then does the browser ask: the
 * app never shows an unasked permission prompt. One small store, so the
 * menu's switch and the watcher that shows notifications agree at once,
 * across tabs too (the `storage` event).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mantle:needs-you:browser-notify';

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/** What the browser allows right now. The desktop app has its own native
 *  path (dock, native notification), so it reports unsupported here. */
export function browserPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (window.mantleDesktop) return 'unsupported';
  return window.Notification.permission;
}

/** Whether a notification may be shown: opted in AND allowed. Pure. */
export function mayNotify(optedIn: boolean, permission: NotifyPermission): boolean {
  return optedIn && permission === 'granted';
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function setBrowserNotify(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* no storage: the choice cannot be kept */
  }
  for (const cb of listeners) cb();
}

/** Opted in on this browser. False on the server and until hydrated. */
export function useBrowserNotifyOptIn(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/**
 * Turn the opt-in on: asks the browser once (a click is the user's gesture,
 * so this is never an unasked prompt). Answers what the browser decided.
 */
export async function enableBrowserNotify(): Promise<NotifyPermission> {
  const now = browserPermission();
  if (now === 'unsupported' || now === 'denied') return now;
  const answer = now === 'granted' ? 'granted' : await window.Notification.requestPermission();
  setBrowserNotify(answer === 'granted');
  return answer;
}
