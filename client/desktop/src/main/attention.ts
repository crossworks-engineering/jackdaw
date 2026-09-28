/**
 * The pure half of the "needs you" desktop behavior (kept out of index.ts so
 * a test can pin it without Electron): which in-app path a notification may
 * open, and how to ask for attention on each platform.
 */

/** An in-app path a notification click may open in the window that sent
 *  it: absolute within the app, never another origin, bounded, no control
 *  characters. Anything else opens nothing (the click still focuses). */
export function safeInAppPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 500) return null;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if ([...path].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return null;
  return path;
}

export type AttentionMode = 'bounce' | 'flash' | null;

/** A focused window needs nothing. Otherwise macOS bounces the dock
 *  (critical: until the app is activated) and Linux flashes the taskbar
 *  entry (until the window is focused). */
export function attentionMode(platform: string, focused: boolean): AttentionMode {
  if (focused) return null;
  return platform === 'darwin' ? 'bounce' : 'flash';
}
