import type { Page } from '@playwright/test';

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

/** The rail's nav, opened to every row the login may see (the Admin scope
 *  shows the whole menu, components/layout/sidebar-nav.tsx). */
export async function wholeNav(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('radio', { name: 'Admin', exact: true }).click();
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
