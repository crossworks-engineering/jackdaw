/**
 * The `?next=` a sign-in bounces to, reduced to what it is allowed to be: a
 * path INSIDE this app. The middleware only ever writes a pathname here, but
 * the parameter arrives from the URL bar, so anyone can put anything in it —
 * and the app router hard-navigates external URLs, which made
 * `/login?next=https://evil.example` an open redirect fired the moment a
 * password was accepted. A scheme-relative `//host` is the same thing spelled
 * shorter, and Chromium reads `/\host` as `//host`, so both are refused too.
 *
 * Returns the path unchanged when it qualifies, else `undefined` so the caller
 * falls back to its default landing.
 */
export function safeNext(next: string | undefined | null): string | undefined {
  if (typeof next !== 'string') return undefined;
  return /^\/(?![/\\])/.test(next) ? next : undefined;
}
