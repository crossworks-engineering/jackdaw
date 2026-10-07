/**
 * The request headers the shell drops on the way to the configured brain, so
 * the brain sees the same request a native client (the mobile app, curl)
 * sends. Pure, so it can be tested without Electron.
 *
 * - `Origin`: the renderer runs on a loopback origin the brain does not know.
 *   Without it the brain skips CORS entirely, as it does for every native
 *   client.
 * - `Sec-Fetch-*`: with no usable Origin, the brain's login-CSRF guard
 *   (refuseCrossSiteAuthPost) reads `Sec-Fetch-Site`, and a loopback renderer
 *   talking to a remote brain is `cross-site`. That refused first-run signup
 *   from the desktop app with a 403. Login was unaffected only because the
 *   split client logs in through the unguarded bearer route.
 *
 * Both are browser claims about a page the shell itself controls, so dropping
 * them gives the brain no less to go on than a native client. A real browser
 * tab cannot do this, so the brain's browser-facing guard is unchanged.
 */
export function stripBrowserOnlyHeaders(
  requestHeaders: Record<string, string>,
): Record<string, string> {
  for (const key of Object.keys(requestHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'origin' || lower.startsWith('sec-fetch-')) delete requestHeaders[key];
  }
  return requestHeaders;
}

/**
 * The requests the fence applies to: everything under the configured brain's
 * origin, its /api/auth routes included. Not narrower, on purpose: the client
 * login's device sign-in (POST /api/auth/client-code and .../verify) is
 * refused by the brain (403 `device-only`) to any request still carrying
 * `Origin` or a `Sec-Fetch-*` header, so a desktop client login exists only
 * because these routes pass through `stripBrowserOnlyHeaders` too.
 */
export function brainRequestFilter(brainOrigin: string): { urls: string[] } {
  return { urls: [`${brainOrigin}/*`] };
}

/**
 * The headers that tell the embedded UI server which brain a window is for.
 * The shell runs one embedded server for every brain, started with the first
 * brain's origin; without these a second brain's window was rendered for the
 * first, CSP included, and could not reach its own brain at all. The key is
 * minted per launch and given to the server process only, so the server can
 * tell the shell's word from any other local caller's. Mirrors
 * client/web/lib/desktop-brain.ts, which this package cannot import.
 */
export const DESKTOP_BRAIN_HEADER = 'X-Jackdaw-Brain';
export const DESKTOP_BRAIN_KEY_HEADER = 'X-Jackdaw-Brain-Key';

export function tagRendererRequest(
  requestHeaders: Record<string, string>,
  brainOrigin: string,
  key: string,
): Record<string, string> {
  requestHeaders[DESKTOP_BRAIN_HEADER] = brainOrigin;
  requestHeaders[DESKTOP_BRAIN_KEY_HEADER] = key;
  return requestHeaders;
}

/**
 * Every request a brain window's session sends that the shell rewrites: the
 * brain's own (made native, see `stripBrowserOnlyHeaders`) and the embedded UI
 * server's (tagged with the brain, see `tagRendererRequest`). One filter for
 * both because a session holds ONE `onBeforeSendHeaders` listener: a second
 * registration replaces the first, it does not add to it.
 */
export function brainWindowRequestFilter(
  brainOrigin: string,
  rendererOrigin: string,
): { urls: string[] } {
  return { urls: [...brainRequestFilter(brainOrigin).urls, `${rendererOrigin}/*`] };
}

/** The request-header rewrite for one URL a brain window's session sends. */
export function rewriteBrainWindowRequest(
  url: string,
  requestHeaders: Record<string, string>,
  origins: { brain: string; renderer: string },
  key: string,
): Record<string, string> {
  if (url.startsWith(`${origins.renderer}/`)) {
    return tagRendererRequest(requestHeaders, origins.brain, key);
  }
  if (url.startsWith(`${origins.brain}/`)) return stripBrowserOnlyHeaders(requestHeaders);
  return requestHeaders;
}
