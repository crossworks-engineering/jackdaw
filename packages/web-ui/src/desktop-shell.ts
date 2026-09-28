/**
 * The Jackdaw desktop shell's injected API — `window.mantleDesktop`, exposed
 * by the shell's preload (client/desktop). Feature-detect via
 * `desktopShell()`: a browser returns null and every caller falls back to
 * plain web behavior. This module is the single owner of the global
 * declaration so client code and the shell agree on one shape.
 */
export type DesktopShellApi = {
  platform: string;
  /** A native notification. `path` (an in-app path, newer shells) is opened
   *  in this window when the notification is clicked. */
  notify(payload: { title: string; body?: string; path?: string }): void;
  setBadge(count: number): void;
  /** Ask for attention until the window is focused: the dock bounces
   *  (macOS, critical) or the taskbar flashes (Linux). Optional: older shells
   *  predate it. */
  attention?(): void;
  /** Register the in-app navigation a notification click asks for; returns
   *  the unsubscribe. Optional: older shells predate it. */
  onNavigate?(cb: (path: string) => void): () => void;
  /** OS-keychain-backed bearer storage (Electron safeStorage). Optional:
   *  older shells predate it, and callers must fall back to localStorage. */
  tokenVault?: {
    get(): string | null;
    set(token: string): void;
    clear(): void;
  };
};

declare global {
  interface Window {
    mantleDesktop?: DesktopShellApi;
  }
}

export function desktopShell(): DesktopShellApi | null {
  return typeof window === 'undefined' ? null : (window.mantleDesktop ?? null);
}
