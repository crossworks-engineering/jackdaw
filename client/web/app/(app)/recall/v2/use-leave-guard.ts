'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

/**
 * Hold navigation away while `dirty`: a browser close or reload gets the
 * browser's own prompt, and a click on an in-app link is stopped and handed
 * to `hold` with a way to go on, so the screen can ask first. The app has no
 * router-level guard to hook into, so this catches link clicks at the
 * document, before Next's own handler sees them. The browser's Back button
 * is not caught: the app router offers no way to stop it.
 */
export function useLeaveGuard(dirty: boolean, hold: (go: () => void) => void) {
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
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
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, hold, router]);
}
