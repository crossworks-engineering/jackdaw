import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MEMBER_HINT_COOKIE, sendsMemberHome } from './lib/member-surface';

/**
 * ZERO-SECRET client middleware. This app holds no SESSION_SECRET, so it can
 * verify NOTHING — real enforcement is the server origin's 401s on every data
 * fetch. The only job here is UX: a page load without the presence cookie
 * (set at login by the token store, cleared at sign-out/bounce) server-
 * redirects to /login instead of flashing an empty shell that then bounces.
 *
 * The presence cookie is spoofable by construction — spoofing it renders a
 * data-free skeleton whose every fetch 401s. Nothing is protected here.
 */
const PRESENCE_COOKIE = 'mantle_authed';

/** Paths that render without a session: login itself, the runtime env,
 *  `/pair` (the static page a browser lands on when it scans the phone
 *  sign-in QR; it holds no data and never reads the code in the fragment) and
 *  `/invite`, where a person redeems a member invite (member logins, Phase 6).
 *  Public paths pass before any cookie is read, so a signed-in browser (admin
 *  or member) is never sent away from them.
 *
 *  `/team` and `/hub`, the team-code portal, are NOT here: the portal is
 *  retired (member logins Phase 6), the brain redirects both to /login, and
 *  on this origin they are ordinary unknown paths behind the presence gate. */
const PUBLIC_PREFIXES: readonly string[] = ['/login', '/env.js', '/pair', '/invite'];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const pass = () => NextResponse.next();

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return pass();
  }
  if (req.cookies.get(PRESENCE_COOKIE)?.value === '1') {
    // A member login's browser is sent off admin-only paths to the member
    // home before the page renders (UX only, see MEMBER_HINT_COOKIE).
    if (
      req.cookies.get(MEMBER_HINT_COOKIE)?.value === '1' &&
      sendsMemberHome(pathname, PUBLIC_PREFIXES)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url, 307);
    }
    return pass();
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|ttf|woff2?)).*)',
  ],
};
