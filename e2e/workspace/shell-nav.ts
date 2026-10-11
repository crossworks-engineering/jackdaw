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
