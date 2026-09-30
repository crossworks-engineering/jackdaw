'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Relative, not `@/`: the unit test imports this file, and vitest has no alias.
import { setNavHold } from '../../../../lib/nav-guard';

/**
 * Whether a click on a link to `href` would take the reader off the screen
 * they are on (`here`), so unsaved edits there would be lost. Same-origin
 * only: a link to another site unloads the page, which `beforeunload` covers.
 */
export function leavesScreen(href: string, here: URL): boolean {
  let url: URL;
  try {
    url = new URL(href, here);
  } catch {
    return false;
  }
  if (url.origin !== here.origin) return false;
  return url.pathname !== here.pathname || url.search !== here.search;
}

/** The history-state key that marks the guard entry. */
const GUARD_KEY = '__jackdawLeaveGuard';

/** Is the current history entry the guard's copy of this screen? */
export function isGuardEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && GUARD_KEY in state;
}

/** The state for the guard entry: the current one (Next keeps its router
 *  tree in it, and needs it back on a Back) plus the mark. */
export function guardEntryState(state: unknown): Record<string, unknown> {
  const base = typeof state === 'object' && state !== null ? state : {};
  return { ...base, [GUARD_KEY]: true };
}

/**
 * Hold navigation away while `dirty`, and hand each attempt to `hold` with
 * a way to go on, so the screen can ask first:
 * - a browser close or reload gets the browser's own prompt;
 * - a click on an in-app link is stopped at the document, before Next's own
 *   handler sees it (the app has no router-level guard to hook into);
 * - Back: while dirty, a copy of this screen's history entry sits on top.
 *   Back lands on the entry below it (the same URL, so nothing changes on
 *   screen); the guard puts its copy back and asks. Leaving goes back past
 *   both. The copy is left in place when the edits are saved, so Back right
 *   after a save can take one extra press; popping it then would race any
 *   navigation the save set off;
 * - a `router.push` from outside the screen that goes through
 *   `guardedNavigate` (the search palette, the needs-you toast).
 */
export function useLeaveGuard(dirty: boolean, hold: (go: () => void) => void) {
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    let leaving = false;
    const guardedHref = window.location.href;
    const arm = () => {
      if (isGuardEntry(window.history.state)) return;
      window.history.pushState(guardEntryState(window.history.state), '', guardedHref);
    };
    arm();
    const onPopState = () => {
      if (leaving || isGuardEntry(window.history.state)) return;
      // A jump of more than one entry (the Back button's long-press list)
      // lands on another URL, and Next is already rendering it: nothing here
      // can stop that. Only the one step onto the entry below the guard,
      // which is this same screen, can be held.
      if (window.location.href !== guardedHref) return;
      arm();
      hold(() => {
        leaving = true;
        window.history.go(-2);
      });
    };
    const release = setNavHold(hold);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const here = new URL(window.location.href);
      if (!leavesScreen(a.href, here)) return;
      e.preventDefault();
      e.stopPropagation();
      const url = new URL(a.href, here);
      hold(() => router.push(url.pathname + url.search + url.hash));
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      release();
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, hold, router]);
}
