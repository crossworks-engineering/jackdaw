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
