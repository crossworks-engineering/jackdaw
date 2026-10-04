'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@mantle/web-ui/ui/toast';
import { desktopShell } from '@mantle/web-ui/desktop-shell';
import {
  arrivalText,
  arrivals,
  titleWithCount,
  totalWaiting,
  type NeedsYou,
} from '@/lib/needs-you';
import {
  browserPermission,
  mayNotify,
  useBrowserNotifyOptIn,
} from '@/lib/needs-you-browser-notify';
import { guardedNavigate } from '@/lib/nav-guard';
import { useNeedsYou, useNeedsYouSync } from './use-needs-you';

/**
 * Headless, admins only. Makes sure an admin is never blind to work waiting
 * for them (Review submissions, open team requests) or to embeddings or
 * extraction failing (no credits, a refused key):
 *
 *  - a toast the moment something ARRIVES while the app is open (never on
 *    first load: only what arrives while you are here), with "Open";
 *  - the tab title "(2) …" and a dot on the favicon while anything waits;
 *  - away from the tab: a browser notification, only when the admin turned
 *    it on in the profile menu (per browser) and the browser allowed it;
 *  - in the desktop app: the dock/taskbar badge count, the dock bouncing
 *    (macOS) or the taskbar flashing (Linux) until the window is focused,
 *    and a native notification whose click opens the item.
 *
 * Every number comes from the brain's count, so all windows agree.
 */
export function NeedsYouWatcher() {
  useNeedsYouSync();
  const needsYou = useNeedsYou();
  const router = useRouter();
  const toast = useToast();
  const optedIn = useBrowserNotifyOptIn();
  const prev = useRef<NeedsYou | null>(null);
  const total = totalWaiting(needsYou);

  // Arrivals: toast always; OS-level only while the window is not in front.
  useEffect(() => {
    if (!needsYou) return;
    const fresh = arrivals(prev.current, needsYou);
    prev.current = needsYou;
    const first = fresh[0];
    if (!first) return;
    const text = arrivalText(first);
    toast.push({
      // An outage is a failure the admin must act on, not a queue item.
      kind: first.kind === 'provider' ? 'error' : 'info',
      message: text.body,
      durationMs: 15_000,
      action: { label: 'Open', onClick: () => guardedNavigate(() => router.push(text.href)) },
    });
    const away = document.visibilityState !== 'visible' || !document.hasFocus();
    if (!away) return;
    const desktop = desktopShell();
    if (desktop) {
      desktop.notify({ title: text.title, body: text.body, path: text.href });
      desktop.attention?.();
      return;
    }
    if (mayNotify(optedIn, browserPermission())) {
      try {
        // One tag: several open tabs replace each other's notice, not stack.
        const n = new window.Notification(text.title, { body: text.body, tag: 'needs-you' });
        n.onclick = () => {
          window.focus();
          guardedNavigate(() => router.push(text.href));
          n.close();
        };
      } catch {
        /* a browser that refuses page notifications: the toast stands */
      }
    }
  }, [needsYou, optedIn, router, toast]);

  // The desktop dock or taskbar badge follows the count.
  useEffect(() => {
    const desktop = desktopShell();
    if (!desktop) return;
    desktop.setBadge(total);
  }, [total]);
  useEffect(() => () => desktopShell()?.setBadge(0), []);

  // A native notification click opens its item in this window.
  useEffect(
    () => desktopShell()?.onNavigate?.((path) => guardedNavigate(() => router.push(path))),
    [router],
  );

  useTitleCount(total);
  useFaviconDot(total > 0);
  return null;
}

/** "(2) <title>" while anything waits. Next sets document.title on every
 *  navigation, so the prefix is re-applied whenever <head> changes. */
function useTitleCount(count: number): void {
  useEffect(() => {
    const apply = () => {
      const want = titleWithCount(document.title, count);
      if (document.title !== want) document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = titleWithCount(document.title, 0);
    };
  }, [count]);
}

/** A dot on the favicon while anything waits: the site's own icon, drawn
 *  with a dot, as the last icon link (the browser shows the last one);
 *  removed when nothing waits, which brings the plain icon back. */
function useFaviconDot(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    let link: HTMLLinkElement | null = null;
    let cancelled = false;
    const base = document.querySelector<HTMLLinkElement>('link[rel~="icon"]:not([data-needs-you])');
    const draw = (img: HTMLImageElement | null) => {
      if (cancelled) return;
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (img) ctx.drawImage(img, 0, 0, size, size);
      const css = getComputedStyle(document.documentElement);
      ctx.beginPath();
      ctx.arc(size - 16, 16, 14, 0, Math.PI * 2);
      ctx.fillStyle = css.getPropertyValue('--destructive').trim() || '#dc2626';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = css.getPropertyValue('--background').trim() || '#ffffff';
      ctx.stroke();
      link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.dataset.needsYou = '1';
      link.href = canvas.toDataURL('image/png');
      document.head.appendChild(link);
    };
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => draw(null);
    img.src = base?.href ?? '/favicon.ico';
    return () => {
      cancelled = true;
      link?.remove();
    };
  }, [on]);
}
