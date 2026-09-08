/**
 * Reduced motion, for the motion CSS cannot reach.
 *
 * The global clamp in `client/web/app/globals.css` handles everything driven by
 * a stylesheet — every `animate-*`, every `transition-*`, everything
 * `tailwindcss-animate` emits. It cannot touch scrolling that JavaScript asks
 * for by name: the `behavior` option of `scrollIntoView`/`scrollTo` overrides
 * the CSS `scroll-behavior` property rather than deferring to it, so a smooth
 * scroll requested in code stays smooth no matter what the media query says.
 * A long smooth scroll is exactly the kind of large-area movement that triggers
 * vestibular symptoms, so those call sites have to ask the question themselves.
 *
 * Read at CALL time, never cached in a module constant: the setting can change
 * under a running tab (an OS accessibility toggle, or the browser's own
 * emulation while someone is testing this), and a value captured at import
 * would then be wrong until reload.
 */

/**
 * Does this user ask for reduced motion?
 *
 * False everywhere the question cannot be asked — during SSR, and in the test
 * environment, which has no `matchMedia`. False is the right default: it keeps
 * the existing behaviour for anyone who has expressed no preference, and this
 * function is only ever used to REMOVE motion, never to add it.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Some embedded engines throw on an unsupported query rather than
    // returning a non-matching MediaQueryList.
    return false;
  }
}

/**
 * The `behavior` to hand `scrollIntoView`/`scrollTo`: the smooth scroll the
 * design wants, or an instant jump for anyone who asked for less motion. The
 * destination is identical either way — only the journey is skipped.
 */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
