import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { BrowserContext } from '@playwright/test';

/**
 * An in-memory member API for the member specs: a real HTTP server in the
 * test process that answers the /api/member/* routes a member's Mine screen
 * calls, with the draft etag contract of the real ones (`if_rev` in,
 * `draft_rev` out, 409 `current_rev` on a stale etag). The owner UI runs
 * with MANTLE_SERVER_ORIGIN pointed here (playwright.member.config.ts).
 *
 * A server rather than page.route(): a write the browser starts while the tab
 * unloads (the leave flush on a reload, sent keepalive) outlives the page,
 * and Playwright's interception never sees it. A server does, as the brain
 * would.
 *
 * Admin routes a member must never call are answered the way the brain
 * answers a member (403 `member-login`) and recorded, so a spec can assert
 * that none was called.
 */

type Doc = Record<string, unknown>;

export const MOCK_API_PORT = Number(process.env.E2E_MEMBER_API_PORT || 3912);
/** The "brain" origin the owner UI is started against. */
export const MOCK_API_ORIGIN = `http://127.0.0.1:${MOCK_API_PORT}`;
export const PAGE_ID = '11111111-1111-4111-8111-111111111111';
export const FILE_ID = '22222222-2222-4222-8222-222222222222';
export const CHILD_ID = '33333333-3333-4333-8333-333333333333';
export const DRAW_ID = '44444444-4444-4444-8444-444444444444';
export const PAGE_TITLE = 'Field notes';
/** A Library page (a brain item at the team level), not in Mine. */
export const LIBRARY_ID = '55555555-5555-4555-8555-555555555555';
export const LIBRARY_TITLE = 'Team handbook';
/** A page this member wrote and an admin accepted into the brain at the
 *  ADMIN level: gone from Mine and from the Library, still readable by its
 *  author through /api/member/accepted. */
export const ACCEPTED_ID = '77777777-7777-4777-8777-777777777777';
export const ACCEPTED_TITLE = 'Site survey';
export const ACCEPTED_AT = '2026-09-20T10:00:00.000Z';

/** A page that embeds what a member editor used to fetch from admin routes:
 *  an uploaded image, a sub-page card and a drawing. */
export const PAGE_DOC: Doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Start.' }] },
    { type: 'image', attrs: { src: `/api/files/files/${FILE_ID}?raw=1`, nodeId: FILE_ID } },
    { type: 'childPage', attrs: { pageId: CHILD_ID, title: 'A sub-page' } },
    { type: 'image', attrs: { src: null, drawId: DRAW_ID } },
  ],
};

/** What a member may call: its own routes, and the few the brain answers
 *  for every login or for nobody in particular (the public invite routes and
 *  the token sign-in among them). Everything else under /api/ is an admin
 *  route (the brain refuses a member there), recorded so a spec can assert
 *  none was called. */
const MEMBER_OK = [
  /^\/api\/member\//,
  /^\/api\/version$/,
  /^\/api\/appearance(\/|$)/,
  /^\/api\/auth\/change-password$/,
  /^\/api\/auth\/invite\//,
  /^\/api\/auth\/token$/,
];
const isAdminOnly = (path: string) =>
  path.startsWith('/api/') && !MEMBER_OK.some((re) => re.test(path));

/** The member's password in the mock; a change replaces it. */
export const MEMBER_PASSWORD = 'first-password-1';

/** Member invites (Phase 6). GOOD previews and redeems; TEAM is an old
 *  8-character team code whose contact has an open invite (previews and
 *  redeems); STALE previews but was used meanwhile, so accept refuses it (the
 *  uniform 401). Any other code previews as the uniform 404. */
export const INVITE_GOOD_CODE = 'GoodCode2345abcd';
export const INVITE_TEAM_CODE = 'Xy7kPq2M';
export const INVITE_STALE_CODE = 'StaleCode234abcd';
export const INVITE_EMAIL = 'sam@example.com';
export const INVITE_NAME = 'Sam Botha';
export const INVITE_SITE = 'Field Office';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

export type MockMemberApi = {
  /** The page's server draft, as the last accepted PUT left it. */
  draft: Doc | null;
  draftRev: number;
  /** Every draft PUT body, in order, with when it arrived (Date.now()). */
  puts: { doc: Doc; if_rev?: number; at: number }[];
  /** Admin-only routes the page called (should stay empty). */
  adminCalls: string[];
  /** Member asset routes the page called. */
  memberAssetCalls: string[];
  /** Every password change the page sent, in order. */
  passwordChanges: { oldPassword: string; newPassword: string }[];
  /** Every invite accept the page sent, in order, with the answer's status. */
  inviteAccepts: { code: string; password: string; status: number }[];
  /** Every token sign-in the page sent (the split client after an accept). */
  tokenSignIns: { email: string; password: string }[];
  /** What GET /api/version answers; set `contractVersion` to fake a brain
   *  on another wire contract. */
  version: { version: string; contractVersion?: number };
  close: () => Promise<void>;
};

/** Sign the browser in as a member, the way the client sees it: the
 *  presence cookie and the member hint (both UX-only; the API is mocked). */
export async function signInAsMember(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_member', value: '1', url: baseURL },
  ]);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMockMemberApi(clientOrigin: string): Promise<MockMemberApi> {
  const state: MockMemberApi = {
    draft: null,
    draftRev: 0,
    puts: [],
    adminCalls: [],
    memberAssetCalls: [],
    passwordChanges: [],
    inviteAccepts: [],
    tokenSignIns: [],
    version: { version: 'mock' },
    close: async () => undefined,
  };
  const now = new Date().toISOString();
  let password = MEMBER_PASSWORD;
  const row = () => ({
    id: PAGE_ID,
    type: 'page',
    title: PAGE_TITLE,
    icon: null,
    sharing: 'private',
    reviewState: 'draft',
    submittedAt: null,
    returnedNote: null,
    authorLoginId: 'login-1',
    updatedAt: now,
  });

  const acceptedRow = () => ({
    id: ACCEPTED_ID,
    type: 'page',
    title: ACCEPTED_TITLE,
    icon: null,
    audience: 'admin',
    acceptedAt: ACCEPTED_AT,
    updatedAt: now,
  });

  const cors = {
    'access-control-allow-origin': clientOrigin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, last-event-id',
    'access-control-max-age': '600',
  };
  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { ...cors, 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const json = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, 'application/json', JSON.stringify(body));

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    if (isAdminOnly(path)) {
      state.adminCalls.push(`${method} ${path}`);
      return json(res, 403, { error: 'forbidden', reason: 'member-login' });
    }
    if (path === '/api/member/shell') {
      return json(res, 200, {
        role: 'member',
        loginId: 'login-1',
        displayName: 'Mo Member',
        email: 'member@example.com',
        avatar: null,
        // Set, so a rail that still loads the admin photo route is caught.
        avatarPhotoVersion: 'abc12345',
        assetToken: '',
        siteName: null,
        colorTheme: null,
        fontLogo: null,
        fontTitle: null,
        fontUi: null,
        fontProse: null,
        fontSize: null,
        fontLogoSize: null,
        fontTitleSize: null,
        fontProseSize: null,
        logoVersion: null,
        logoDarkVersion: null,
      });
    }
    if (path === '/api/member/realtime') return send(res, 200, 'text/event-stream', ':\n\n');
    if (path === '/api/member/home') return json(res, 200, { homeApp: null, hub: null });
    if (path === '/api/member/apps') return json(res, 200, { apps: [], homeAppId: null });
    if (path === '/api/auth/change-password' && method === 'POST') {
      // The brain's own answers (server/web/app/api/auth/change-password).
      const body = JSON.parse(await readBody(req)) as { oldPassword: string; newPassword: string };
      state.passwordChanges.push(body);
      if (body.oldPassword !== password) {
        return json(res, 401, { error: 'Current password is incorrect.' });
      }
      password = body.newPassword;
      return json(res, 200, { ok: true });
    }
    // The public invite routes (server/web/app/api/auth/invite in mantle).
    if (path.startsWith('/api/auth/invite/') && path !== '/api/auth/invite/accept') {
      const code = decodeURIComponent(path.slice('/api/auth/invite/'.length));
      if ([INVITE_GOOD_CODE, INVITE_TEAM_CODE, INVITE_STALE_CODE].includes(code)) {
        return json(res, 200, {
          email: INVITE_EMAIL,
          displayName: INVITE_NAME,
          siteName: INVITE_SITE,
        });
      }
      return json(res, 404, { error: 'Invite not found.' });
    }
    if (path === '/api/auth/invite/accept' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { code: string; password: string };
      const answer = (status: number, out: unknown) => {
        state.inviteAccepts.push({ code: body.code, password: body.password, status });
        return json(res, status, out);
      };
      if (typeof body.password !== 'string' || body.password.length < 8) {
        return answer(400, { error: 'Choose a password of at least 8 characters.' });
      }
      if (body.code !== INVITE_GOOD_CODE && body.code !== INVITE_TEAM_CODE) {
        return answer(401, { error: 'This invite is not valid. Ask for a new one.' });
      }
      password = body.password;
      return answer(200, { ok: true, email: INVITE_EMAIL });
    }
    if (path === '/api/auth/token' && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { email: string; password: string };
      state.tokenSignIns.push({ email: body.email, password: body.password });
      if (body.email !== INVITE_EMAIL || body.password !== password) {
        return json(res, 401, { error: 'Invalid email or password.' });
      }
      return json(res, 200, { token: 'member-bearer-token' });
    }
    if (path === '/api/member/space' && method === 'GET') {
      const items = url.searchParams.get('kind') === 'page' ? [row()] : [];
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (path === `/api/member/space/${PAGE_ID}` && method === 'GET') {
      return json(res, 200, {
        row: row(),
        body: {
          type: 'page',
          page: { doc: PAGE_DOC, draft: state.draft, draftRev: state.draftRev, title: PAGE_TITLE },
        },
      });
    }
    if (path === `/api/member/space/${PAGE_ID}/draft` && method === 'PUT') {
      const body = JSON.parse(await readBody(req)) as { doc: Doc; if_rev?: number };
      state.puts.push({ ...body, at: Date.now() });
      if (body.if_rev !== undefined && body.if_rev !== state.draftRev) {
        return json(res, 409, { error: 'The draft changed.', current_rev: state.draftRev });
      }
      state.draft = body.doc;
      state.draftRev += 1;
      return json(res, 200, { ok: true, draft_rev: state.draftRev });
    }
    if (path === `/api/member/library/${LIBRARY_ID}` && method === 'GET') {
      return json(res, 200, {
        item: {
          id: LIBRARY_ID,
          type: 'page',
          title: LIBRARY_TITLE,
          icon: null,
          summary: null,
          audience: 'team',
          updatedAt: now,
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read me.' }] }],
          },
        },
      });
    }
    if (path === '/api/member/accepted' && method === 'GET') {
      const items = url.searchParams.get('kind') === 'page' ? [acceptedRow()] : [];
      return json(res, 200, { items, total: items.length, page: 1, pageSize: 20 });
    }
    if (path === `/api/member/accepted/${ACCEPTED_ID}` && method === 'GET') {
      return json(res, 200, {
        item: {
          ...acceptedRow(),
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved survey.' }] }],
          },
        },
      });
    }
    if (path.startsWith('/api/member/space/') && path.endsWith('/comments')) {
      return json(res, 200, { comments: [] });
    }
    if (path.startsWith('/api/member/files/')) {
      state.memberAssetCalls.push(path);
      return send(res, 200, 'image/png', PNG_1PX);
    }
    if (path.startsWith('/api/member/draws/')) {
      state.memberAssetCalls.push(path);
      return send(
        res,
        200,
        'image/svg+xml',
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      );
    }
    if (path === '/api/version') return json(res, 200, state.version);
    // Anything else: a plain 404, never a 401 (that would bounce to /login).
    return json(res, 404, { error: `not mocked: ${method} ${path}` });
  };

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => json(res, 500, { error: String(err) }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(MOCK_API_PORT, '127.0.0.1', () => resolve());
  });
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return state;
}
