import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MEMBER_HINT_COOKIE, sendsMemberHome } from './lib/member-surface';
import { CLIENT_HINT_COOKIE, CLIENT_SIGNIN_PATH, clientRedirectFor } from './lib/client-surface';

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
 *  sign-in QR; it holds no data and never reads the code in the fragment),
 *  `/invite`, where a person redeems a member invite (member logins, Phase 6),
 *  and `/client-signin`, where a client opens the sign-in link an admin issued
 *  (client logins C2). Public paths pass before any cookie is read, so a
 *  signed-in browser is never sent away from them (the one exception: a
 *  hinted client's /login, below). */
const PUBLIC_PREFIXES: readonly string[] = [
  '/login',
  '/env.js',
  '/pair',
  '/invite',
  CLIENT_SIGNIN_PATH,
];

/** The retired team-code portal (member logins Phase 6): `/team`, `/hub` and
 *  anything under them. A team member signs in with a member login now, so
 *  an old bookmark goes straight to /login, for everyone and before the
 *  presence gate, the same as the brain's mountRetiredTeamPages: no `next`
 *  (the page is gone) and no query carried over (an old link may hold a
 *  team code). `/team-admin`, the owner console, is not under `/team`. */
const RETIRED_PREFIXES: readonly string[] = ['/team', '/hub'];

const under = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const pass = () => NextResponse.next();

  if (under(pathname, RETIRED_PREFIXES)) {
    // A fresh URL, not a clone: a clone of `/team/` keeps its trailing slash
    // (`/login/`), and nothing of the old address may ride along.
    return NextResponse.redirect(new URL('/login', req.nextUrl.origin), 307);
  }
  const hintedClient = req.cookies.get(CLIENT_HINT_COOKIE)?.value === '1';
  // A client has no password: /login is not their way in. A client whose
  // session ended (the shell's 401 bounces to /login) lands on the client
  // sign-in page instead, which says to open their link and offers staff
  // sign-in (clearing the hint) for anyone else on this browser.
  if (hintedClient && under(pathname, ['/login'])) {
    return NextResponse.redirect(new URL(CLIENT_SIGNIN_PATH, req.nextUrl.origin), 307);
  }
  if (under(pathname, PUBLIC_PREFIXES)) return pass();
  if (req.cookies.get(PRESENCE_COOKIE)?.value === '1') {
    // A client login's browser is sent from every other path to the client
    // home before the page renders (UX only, see CLIENT_HINT_COOKIE), with
    // the item open when the path named one. Nothing is carried over.
    const clientTo = hintedClient ? clientRedirectFor(pathname, PUBLIC_PREFIXES) : null;
    if (clientTo) return NextResponse.redirect(new URL(clientTo, req.nextUrl.origin), 307);
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
