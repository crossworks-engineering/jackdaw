import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload for the Mantle UI window.
 *
 * 1. Injects window.__MANTLE_ENV__ with the user-chosen brain origin — the
 *    same object the web client's /env.js route emits
 *    (packages/web-ui/src/runtime-env.ts reads it). contextBridge bindings
 *    are read-only in the main world, so this value is authoritative. The
 *    served /env.js agrees with it: the shell names this window's brain on
 *    every request to the embedded server (brain-fence.ts).
 * 2. Exposes window.mantleDesktop — the small desktop API the UI's
 *    DesktopBridge and NeedsYouWatcher components feature-detect: OS
 *    notifications (a click can open an in-app path), a dock/taskbar badge,
 *    and asking for attention (dock bounce, taskbar flash).
 */
const flag = '--mantle-env=';
const arg = process.argv.find((a) => a.startsWith(flag));
if (arg) {
  try {
    contextBridge.exposeInMainWorld('__MANTLE_ENV__', JSON.parse(arg.slice(flag.length)));
  } catch {
    // Malformed env argument: fall through — the UI degrades to same-origin
    // behavior, which fails visibly rather than silently pointing elsewhere.
  }
}

contextBridge.exposeInMainWorld('mantleDesktop', {
  platform: process.platform,
  notify: (payload: { title: string; body?: string; path?: string }) =>
    ipcRenderer.send('desktop:notify', payload),
  setBadge: (count: number) => ipcRenderer.send('desktop:badge', count),
  // Bounce the dock (macOS) or flash the taskbar (Linux) until focused.
  attention: () => ipcRenderer.send('desktop:attention'),
  // A notification click asks the UI to open an in-app path.
  onNavigate: (cb: (path: string) => void) => {
    const handler = (_event: unknown, path: unknown) => {
      if (typeof path === 'string') cb(path);
    };
    ipcRenderer.on('desktop:navigate', handler);
    return () => {
      ipcRenderer.removeListener('desktop:navigate', handler);
    };
  },
  // OS-keychain-backed bearer storage (packages/web-ui token-store detects
  // this and stops using localStorage). get() is a sync round-trip to main —
  // sub-millisecond, and always fresh across windows.
  tokenVault: {
    get: (): string | null => {
      const value = ipcRenderer.sendSync('vault:get') as unknown;
      return typeof value === 'string' ? value : null;
    },
    set: (token: string) => ipcRenderer.send('vault:set', token),
    clear: () => ipcRenderer.send('vault:clear'),
    // One bearer per LOGIN held for this window's brain (session-registry.ts).
    // Their presence is what tells the UI this shell can hold several; the
    // unscoped three above are the one slot earlier builds wrote, kept so the
    // first run after an update has something to adopt from.
    getFor: (sessionId: string): string | null => {
      const value = ipcRenderer.sendSync('vault:getFor', sessionId) as unknown;
      return typeof value === 'string' ? value : null;
    },
    setFor: (sessionId: string, token: string) =>
      ipcRenderer.send('vault:setFor', sessionId, token),
    clearFor: (sessionId: string) => ipcRenderer.send('vault:clearFor', sessionId),
    /** Move the one-slot bearer to a login that has none, and return it. */
    adopt: (sessionId: string): string | null => {
      const value = ipcRenderer.sendSync('vault:adopt', sessionId) as unknown;
      return typeof value === 'string' ? value : null;
    },
  },
  // "Add login" for ANOTHER brain: the shell checks the address, saves the
  // brain and opens its own window on its sign-in screen. Only an address and
  // an email cross; a password never does.
  brains: {
    openForLogin: (url: string, email?: string) =>
      ipcRenderer.invoke('brains:openForLogin', url, email),
    takeLoginHint: () => ipcRenderer.invoke('brains:takeLoginHint'),
  },
});
