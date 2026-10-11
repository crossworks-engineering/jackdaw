import { expect, type Page } from '@playwright/test';

/** The workspace screens every login opens, as the nav names them. */
export const WORK_ROWS = ['Pages', 'Notes', 'Files', 'Tables', 'Draw', 'Apps'] as const;

/** Rows only a login with an Admin area sees: the settings it manages and
 *  the brain's own screens. */
export const ADMIN_ROWS = [
  'Users',
  'Agents',
  'AI workers',
  'Connectors',
  'API keys',
  'Tools',
  'Tool groups',
  'Skills',
  'Peers',
  'Backups',
  'Audit log',
  'Runs',
  'Journal',
  'Contacts',
  'Secrets',
] as const;

/**
 * The rail's nav, opened to every row the login may see. An admin picks the
 * Admin scope (the whole menu, components/layout/sidebar-nav.tsx). A member
 * or a client holds no settings area: it gets no Work / Settings / Admin
 * choice at all, and its rows are all there, flat.
 */
export async function wholeNav(page: Page, role: 'admin' | 'member' | 'client') {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const scopes = nav.getByRole('group', { name: 'How much of the menu to show' });
  if (role === 'admin') {
    await nav.getByRole('radio', { name: 'Admin', exact: true }).click();
  } else {
    await expect(nav.getByRole('link', { name: 'Pages', exact: true })).toBeVisible();
    await expect(scopes).toHaveCount(0);
    await expect(nav.getByRole('radio')).toHaveCount(0);
  }
  return nav;
}

/** Paths a login asks of any brain: the shell, the version, what /login asks
 *  and sign-in itself. */
export const ANY_LOGIN = [
  /^\/api\/shell$/,
  /^\/api\/version$/,
  /^\/api\/appearance(\/|$)/,
  /^\/api\/auth\//,
];

/** Any live-update stream: the owner's /api/realtime or a member's
 *  /api/member/realtime (lib/realtime-stream.ts picks one by role). */
export const ANY_STREAM = /^GET \/api\/(member\/)?realtime$/;

/** The requests (`METHOD /path`) whose path matches none of `allowed`. */
export function outside(asked: readonly string[], allowed: readonly RegExp[]): string[] {
  return asked.filter((r) => {
    const path = r.slice(r.indexOf(' ') + 1);
    return !allowed.some((re) => re.test(path));
  });
}

const ID = '[0-9a-f-]{36}';
const KIND = '[a-z]+';
const rx = (method: string, path: string) => new RegExp(`^${method} ${path}$`);

/**
 * The owner routes a W6b brain opens to a member or a client (route-scope.ts
 * MEMBER_OPEN_READS and MEMBER_OPEN_WRITES at the brain commit this phase was
 * built against), as `METHOD path`. Every other owner route refuses them.
 * Also /api/grants and /api/workspaces, which answer every login.
 */
export const MEMBER_OPEN: readonly RegExp[] = [
  // Reads.
  rx('GET', `/api/(pages|notes|draws|tables|apps)`),
  rx('GET', `/api/(pages|notes|draws|tables|apps)/${ID}`),
  rx('GET', `/api/pages/${ID}/(backlinks|descendant-count)`),
  rx('GET', `/api/tables/${ID}/rows`),
  rx('GET', `/api/tree/${KIND}(/(search|tags|marks))?`),
  rx('GET', `/api/nodes/${ID}`),
  rx('GET', `/api/(search|mentions/search|formulas)`),
  rx('GET', `/api/formulas/${ID}`),
  rx('GET', `/api/files/(files|folders)`),
  rx('GET', `/api/files/folders/${ID}`),
  // Writes.
  rx('POST', `/api/(pages|notes|draws|tables|apps|files/files|files/folders)`),
  rx('(PATCH|DELETE)', `/api/(pages|notes|draws|tables|apps|files/files|files/folders)/${ID}`),
  rx('PUT', `/api/(pages|draws|tables|apps)/${ID}/draft`),
  rx('DELETE', `/api/apps/${ID}/draft`),
  rx('POST', `/api/(pages|draws|tables)/${ID}/(commit|discard-draft)`),
  rx('POST', `/api/pages/${ID}/move`),
  rx('POST', `/api/tables/${ID}/draft-ops`),
  rx('POST', `/api/apps/${ID}/(build|format|publish)`),
  rx('POST', `/api/tree/${KIND}/(folders|move)`),
  rx('(PATCH|DELETE)', `/api/tree/${KIND}/folders/${ID}`),
  rx('POST', `/api/tree/items/${ID}/opened`),
  rx('PUT', `/api/tree/items/${ID}/pin`),
  // Every login.
  /^[A-Z]+ \/api\/(grants|workspaces)(\/|$)/,
];

/** The paths a W6b brain answers 410 (contract item 1). */
export const GONE_ROUTE =
  /^\/api\/(member\/(space|space-files|my-apps|items|tree)|admin\/(space|space-files))(\/|$)/;

/** The requests (`METHOD /path`) that match none of `allowed`, where each
 *  allowed pattern is tested against the whole `METHOD /path`. */
export function outsideRoutes(asked: readonly string[], allowed: readonly RegExp[]): string[] {
  return asked.filter((r) => !allowed.some((re) => re.test(r)));
}
