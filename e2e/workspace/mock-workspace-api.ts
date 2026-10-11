import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { expect, type Page } from '@playwright/test';

/**
 * An in-memory brain for the workspace specs (phase W5c: one shell for every
 * login): a real HTTP server in the spec process. The owner UI runs with
 * MANTLE_SERVER_ORIGIN pointed here (playwright.workspace.config.ts), so the
 * browser calls it cross-origin with the bearer the real /login form got
 * from POST /api/auth/token.
 *
 * Three logins, one password: an admin (every area, every workspace), a
 * member (Team and Field crew) and a client (Client desk). GET /api/shell
 * answers each as the W5c brain does (`role`, `loginId`, `workspaces`,
 * `areas`, `treeKinds`). A member reads its data from /api/member/*; a
 * client has no data routes. Each role is refused the routes the brain
 * refuses it (403), and every request is recorded with the role that sent
 * it, so a spec can assert what a login never asked for.
 *
 * Only what the specs need is answered. Anything else is a plain 404 (never
 * a 401, which would bounce the page to /login).
 */

export const MOCK_API_PORT = Number(process.env.E2E_WORKSPACE_API_PORT || 3922);
/** The "brain" origin the owner UI is started against. */
export const MOCK_API_ORIGIN = `http://127.0.0.1:${MOCK_API_PORT}`;

/** The key the owner UI under test is started with in place of the desktop
 *  shell's per-launch one (client/web/lib/desktop-brain.ts): a spec sending it
 *  names the brain a request renders for, as the shell does for each window. */
export const MOCK_DESKTOP_BRAIN_KEY = 'e2e-desktop-brain-key-not-a-secret';

/** The one password of every mock login (a test value, nothing real). */
export const PASSWORD = 'workspace-e2e-password-1';

export type Role = 'admin' | 'member' | 'client';

export const LOGINS: Record<Role, { email: string; name: string; loginId: string }> = {
  admin: {
    email: 'ada@example.invalid',
    name: 'Ada Admin',
    loginId: '48484848-4848-4484-8484-484848484848',
  },
  member: {
    email: 'mo@example.invalid',
    name: 'Mo Member',
    loginId: '49494949-4949-4494-8494-494949494949',
  },
  client: {
    email: 'pat@example.invalid',
    name: 'Pat Client',
    loginId: '16161616-1616-4161-8161-161616161616',
  },
};

export const WORKSPACES = {
  admin: { id: 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', name: 'Admin' },
  team: { id: 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', name: 'Team' },
  field: { id: 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', name: 'Field crew' },
  board: { id: 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3', name: 'Board room' },
  desk: { id: 'e4e4e4e4-e4e4-4e4e-8e4e-e4e4e4e4e4e4', name: 'Client desk' },
} as const;
type WorkspaceKey = keyof typeof WORKSPACES;

/** Which workspaces each login is in (a Moderator of the ones marked). */
const MEMBERSHIP: Record<Role, { ws: WorkspaceKey; moderator: boolean }[]> = {
  admin: [
    { ws: 'admin', moderator: true },
    { ws: 'team', moderator: true },
    { ws: 'field', moderator: false },
    { ws: 'board', moderator: true },
    { ws: 'desk', moderator: true },
  ],
  member: [
    { ws: 'team', moderator: false },
    { ws: 'field', moderator: true },
  ],
  client: [{ ws: 'desk', moderator: false }],
};

/** The brain's pages, each in one workspace. The member's answers hold the
 *  pages of its own workspaces only; Board minutes is in none of them. */
export const PAGES = {
  handbook: {
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Crew handbook',
    ws: 'team',
  },
  survey: {
    id: '77777777-7777-4777-8777-777777777777',
    title: 'Site survey',
    ws: 'field',
  },
  minutes: {
    id: '99999999-9999-4999-8999-999999999999',
    title: 'Board minutes',
    ws: 'board',
  },
} as const satisfies Record<string, { id: string; title: string; ws: WorkspaceKey }>;

const ALL_AREAS = ['settings', 'users', 'assistants', 'connectors', 'keys'];
/** The kinds a member's tree serves, by the tree's own name. */
const MEMBER_TREE_KINDS = ['files', 'notes', 'pages', 'draw', 'tables'];

const tokenOf = (role: Role) => `ws-e2e-${role}-bearer`;
const roleOfToken = (header: string | undefined): Role | null => {
  const token = header?.replace(/^Bearer\s+/i, '');
  return (['admin', 'member', 'client'] as const).find((r) => tokenOf(r) === token) ?? null;
};

/** What anyone may ask, signed in or not: what /login asks, and sign-in. */
const PUBLIC = [
  /^\/api\/version$/,
  /^\/api\/appearance(\/|$)/,
  /^\/api\/auth\/bootstrap-state$/,
  /^\/api\/auth\/client-code$/,
  /^\/api\/auth\/token$/,
  /^\/api\/auth\/(mobile-)?logout$/,
];
/** What the brain answers every signed-in login. */
const EVERY_LOGIN = [/^\/api\/shell$/, /^\/api\/workspaces(\/|$)/];

export type MockRequest = { method: string; path: string; role: Role | 'anon' };

export type MockWorkspaceApi = {
  /** Every request, in order (CORS preflights left out). */
  requests: MockRequest[];
  /** Every sign-in, with the email asked for and the status answered. */
  signIns: { email: string; status: number }[];
  /** The paths `role` asked for (method and path), in order. */
  asked: (role: Role) => string[];
  /** What GET /api/shell says in `onboarded`, for every login (default true). */
  onboarded: boolean;
  close: () => Promise<void>;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function startMockWorkspaceApi(clientOrigin: string): Promise<MockWorkspaceApi> {
  const now = new Date().toISOString();
  const state: MockWorkspaceApi = {
    requests: [],
    signIns: [],
    asked: (role) =>
      state.requests.filter((r) => r.role === role).map((r) => `${r.method} ${r.path}`),
    onboarded: true,
    close: async () => undefined,
  };

  const cors = {
    'access-control-allow-origin': clientOrigin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, last-event-id, idempotency-key',
    'access-control-max-age': '600',
  };
  const send = (res: ServerResponse, status: number, type: string, body: string) => {
    res.writeHead(status, { ...cors, 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const json = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, 'application/json', JSON.stringify(body));

  const shellWorkspaces = (role: Role) =>
    MEMBERSHIP[role].map(({ ws, moderator }) => ({
      id: WORKSPACES[ws].id,
      name: WORKSPACES[ws].name,
      isAdmin: ws === 'admin',
      moderator,
    }));
  const pagesOf = (role: Role) => {
    const mine = new Set(MEMBERSHIP[role].map((m) => m.ws));
    return Object.values(PAGES).filter((p) => mine.has(p.ws));
  };

  const shell = (role: Role) => ({
    role,
    loginId: LOGINS[role].loginId,
    workspaces: shellWorkspaces(role),
    areas: role === 'admin' ? ALL_AREAS : [],
    ...(role === 'client' ? {} : { treeKinds: MEMBER_TREE_KINDS }),
    onboarded: state.onboarded,
    displayName: LOGINS[role].name,
    email: LOGINS[role].email,
    avatar: null,
    avatarPhotoVersion: null,
    pendingApprovals: 0,
    assetToken: '',
    siteName: null,
    peerName: null,
    logoVersion: null,
    logoDarkVersion: null,
    colorTheme: null,
    fontLogo: null,
    fontTitle: null,
    fontUi: null,
    fontProse: null,
    fontSize: null,
    fontLogoSize: null,
    fontTitleSize: null,
    fontProseSize: null,
  });

  /** A tree answer in the brain's shape, every item at the top level. */
  const tree = (kind: string, items: Record<string, unknown>[], url: URL) => ({
    kind,
    folder: null,
    crumbs: [],
    folders: [],
    items,
    sort: url.searchParams.get('sort') ?? 'name',
    nextCursor: null,
  });
  const treeItem = (p: { id: string; title: string }) => ({
    id: p.id,
    title: p.title,
    icon: null,
    color: null,
    subtype: null,
    level: 'team',
    state: null,
    updatedAt: now,
  });

  /** A member's routes (/api/member/*); true when it answered. */
  const handleMember = (res: ServerResponse, url: URL, path: string): boolean => {
    if (path === '/api/member/realtime')
      return (send(res, 200, 'text/event-stream', ':\n\n'), true);
    if (path === '/api/member/home') return (json(res, 200, { homeApp: null, hub: null }), true);
    const treeM = /^\/api\/member\/tree\/([a-z]+)(\/search)?$/.exec(path);
    if (treeM) {
      const kind = treeM[1]!;
      if (!MEMBER_TREE_KINDS.includes(kind))
        return (json(res, 404, { error: 'unknown kind' }), true);
      const items = kind === 'pages' ? pagesOf('member').map(treeItem) : [];
      if (treeM[2]) {
        const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
        const hits = items
          .filter((i) => String(i.title).toLowerCase().includes(q))
          .map((i) => ({ ...i, crumbs: [] }));
        return (json(res, 200, { kind, folders: [], items: hits, nextCursor: null }), true);
      }
      return (json(res, 200, tree(kind, items, url)), true);
    }
    return false;
  };

  /** The owner routes the admin's Pages and Users screens need; true when
   *  it answered. */
  const handleAdmin = (res: ServerResponse, url: URL, path: string): boolean => {
    if (path === '/api/tree/pages') {
      return (json(res, 200, tree('pages', Object.values(PAGES).map(treeItem), url)), true);
    }
    // Settings > Users: every login, in the brain's UserRow shape.
    if (path === '/api/users') {
      const users = (Object.keys(LOGINS) as Role[]).map((r) => ({
        id: LOGINS[r].loginId,
        email: LOGINS[r].email,
        displayName: LOGINS[r].name,
        isOwner: r === 'admin',
        createdAt: '2026-09-01T08:00:00.000Z',
        lastLoginAt: null,
        agent: null,
        role: r,
        contactId: null,
        disabledAt: null,
      }));
      return (json(res, 200, { users, currentActorId: LOGINS.admin.loginId }), true);
    }
    // The flat Users screen's other reads (kept W5c routes): open invites,
    // the chat roster, and the agents a personal assistant copies from.
    if (path === '/api/team-admin/invites') return (json(res, 200, { invites: [] }), true);
    if (path === '/api/team-admin/member-chats') {
      const members = (['member', 'client'] as const).map((r) => ({
        loginId: LOGINS[r].loginId,
        name: LOGINS[r].name,
        email: LOGINS[r].email,
        active: r === 'member',
        role: r,
        lastMessageAt: null,
        lastMessageText: null,
        lastMessageDirection: null,
        messageCount: 0,
      }));
      return (json(res, 200, { members, selected: null }), true);
    }
    if (path === '/api/agents') return (json(res, 200, { agents: [] }), true);
    return false;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    if (method === 'OPTIONS') return send(res, 204, 'text/plain', '');
    const url = new URL(req.url ?? '/', MOCK_API_ORIGIN);
    const path = url.pathname;
    const role = roleOfToken(req.headers.authorization);
    state.requests.push({ method, path, role: role ?? 'anon' });

    if (PUBLIC.some((re) => re.test(path))) {
      if (path === '/api/version') return json(res, 200, { version: 'mock' });
      if (path.startsWith('/api/appearance')) return json(res, 200, { siteName: null });
      if (path === '/api/auth/bootstrap-state') return json(res, 200, { firstRun: false });
      if (path === '/api/auth/client-code') return json(res, 200, { enabled: false });
      if (path === '/api/auth/token' && method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          email?: string;
          password?: string;
        };
        const who = (Object.keys(LOGINS) as Role[]).find((r) => LOGINS[r].email === body.email);
        const status = who && body.password === PASSWORD ? 200 : 401;
        state.signIns.push({ email: body.email ?? '', status });
        return who && status === 200
          ? json(res, 200, { token: tokenOf(who) })
          : json(res, 401, { error: 'Invalid email or password.' });
      }
      return json(res, 200, { ok: true });
    }
    if (!role) return json(res, 401, { error: 'Unauthorized' });

    if (EVERY_LOGIN.some((re) => re.test(path))) {
      if (path === '/api/shell') return json(res, 200, shell(role));
      return json(res, 404, { error: `not mocked: ${method} ${path}` });
    }
    // The brain's gates: a member reads /api/member/* only, a client none of
    // the data routes, an admin the owner routes.
    if (path.startsWith('/api/member/')) {
      if (role !== 'member') return json(res, 403, { error: 'forbidden', reason: `${role}-login` });
      if (handleMember(res, url, path)) return;
    } else if (path.startsWith('/api/client/')) {
      return json(res, 403, { error: 'forbidden', reason: `${role}-login` });
    } else if (role !== 'admin') {
      return json(res, 403, { error: 'forbidden', reason: `${role}-login` });
    } else if (handleAdmin(res, url, path)) {
      return;
    }
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

/**
 * Sign in through the real /login form: the password goes to the mock's
 * POST /api/auth/token, the form keeps the bearer (the token store) and
 * lands on the home.
 */
export async function signIn(page: Page, role: Role): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(LOGINS[role].email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/', { timeout: 60_000 });
}
