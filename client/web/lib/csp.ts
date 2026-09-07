/**
 * The Content Security Policy.
 *
 * The client keeps a 30-day bearer in localStorage, and `token-store.ts` rested
 * its threat model on "the client app's CSP" for months before one existed.
 * This is the first half of that CSP, and an honest account of why it is a
 * half.
 *
 * ── Where a CSP can actually be set in this app ──────────────────────────────
 * The policy wants to name the brain origin (connect-src is what stops an
 * injected script posting the bearer to an attacker), and that origin exists
 * ONLY in the running box's environment: one prebuilt image serves any brain,
 * which is why /env.js reads `MANTLE_SERVER_ORIGIN` per request instead of
 * baking it. Three ways to set the header were tried and MEASURED, not assumed:
 *
 *   1. `headers()` in next.config.ts — resolved at BUILD time. The variable was
 *      set in the server's environment and /env.js served it correctly, while
 *      the same value came out empty in a header declared there.
 *   2. Middleware, edge runtime — same result. Next bundles middleware
 *      separately and folds `process.env` into it at build: the built
 *      `.next/server/middleware.js` contained ZERO references to the variable.
 *   3. Middleware, `runtime: 'nodejs'`, and again reading the key through a
 *      variable to defeat static substitution — still empty, still zero
 *      references. Middleware cannot see runtime env here, full stop.
 *
 * Server components and route handlers CAN (their env reads survive into
 * `.next/server/chunks/`, which is why /env.js works). So the origin-dependent
 * half belongs in a `<meta http-equiv>` rendered by the root layout — meta
 * supports every directive below EXCEPT `frame-ancestors`, which is header-only
 * and happily needs no origin.
 *
 * ── What ships now, and what waits ──────────────────────────────────────────
 * A CSP fails closed and silently: a wrong directive does not throw, it stops a
 * feature working and nobody finds out until a user does. So what ships is what
 * can be verified without a signed-in session:
 *
 *   • {@link CSP_ENFORCED_STATIC} — needs no origin, cannot plausibly break us,
 *     set as a real header from next.config.ts. Enforced today.
 *   • {@link buildRuntimeCsp} — the origin-dependent remainder, written and
 *     unit-tested here, NOT yet emitted. Enabling it is a meta tag in the root
 *     layout plus one signed-in pass with the console open. The four surfaces
 *     worth exercising are the ones that frame, eval, or load bytes from
 *     somewhere unusual: the mini-app sandbox, the drawing canvas, the formula
 *     screen, and the email reading pane.
 */

/**
 * Enforced today, as a header. Every directive here is origin-independent and
 * was checked against the code rather than assumed:
 *
 *  - `base-uri`: no `<base href>` anywhere. (The one `<base>` in the tree sets
 *    `target` inside the email iframe's srcdoc, which this does not govern.)
 *  - `object-src`: no `<object>`/`<embed>` in the app at all.
 *  - `frame-ancestors`: nothing is known to embed the owner UI, and the desktop
 *    shell loads it top-level. If a customer ever needs to frame the team
 *    portal, this is the line to widen. Header-only — meta ignores it.
 */
export const CSP_ENFORCED_STATIC = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

export type RuntimeCspOptions = {
  /** The brain's origin, e.g. `https://brain.example`. Empty for a same-origin
   *  deployment, where `'self'` already covers it. */
  brainOrigin: string;
  /** Dev servers need `ws:` for HMR. Nothing in app code opens a WebSocket —
   *  the live streams are SSE over http — so that is its only reason. */
  dev?: boolean;
};

const clean = (origin: string) => origin.trim().replace(/\/+$/, '');

/** Join sources, dropping empties, so an absent brain origin leaves no gap. */
const list = (...sources: string[]) => sources.filter(Boolean).join(' ');

/**
 * The origin-dependent half, ready to emit once it has been exercised signed
 * in. Pure and tested, so the only thing left to verify is the browser.
 */
export function buildRuntimeCsp({ brainOrigin, dev = false }: RuntimeCspOptions): string {
  const brain = clean(brainOrigin);
  return [
    "default-src 'self'",
    // Next inlines its bootstrap, so 'unsafe-inline' stays until a nonce pass,
    // and mathjs compiles expressions on the formula screen. Neither is ideal
    // and neither is the point: connect-src is what stops a successful
    // injection getting the token off the box.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    // blob: for owner-generated previews — drawing exports, image attachments,
    // team media. Every real asset comes from the brain via assetUrl().
    `img-src ${list("'self'", 'data:', 'blob:', brain)}`,
    "font-src 'self' data:",
    // THE control: the directive that makes the bearer-in-localStorage posture
    // defensible.
    `connect-src ${list("'self'", brain, dev ? 'ws: wss:' : '')}`,
    // `'self'` ALONE WOULD BREAK SSO: components/team-workspace/open-on-server.tsx
    // POSTs a real cross-origin form to <brain>/api/team/sso.
    `form-action ${list("'self'", brain)}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    `media-src ${list("'self'", 'blob:', 'data:', brain)}`,
    "manifest-src 'self'",
  ].join('; ');
}
