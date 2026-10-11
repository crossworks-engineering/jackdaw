import { expect, test } from '@playwright/test';
import {
  LOGINS,
  PAGES,
  signIn,
  startMockWorkspaceApi,
  type MockWorkspaceApi,
} from './mock-workspace-api';
import { ADMIN_ROWS, WORK_ROWS, wholeNav } from './shell-nav';

/**
 * An admin in the one shell (phase W5c): every area, so the full nav with
 * Settings > Users, and the owner Pages screen, which reads the owner tree
 * (GET /api/tree/pages) and so every page of the brain. In-memory brain, no
 * real one.
 */
/** The Users screen's retired reads (410 on a W5c brain). */
const GONE =
  /\/api\/team-admin\/(submissions|member-items|needs-you|requests|notify)|\/api\/team-admin\/clients(?!\/signin-sender)|\/api\/access\/client-report|\/api\/apps\/members/;

let api: MockWorkspaceApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockWorkspaceApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

test('the full nav, the owner Pages screen and Settings > Users', async ({ page }) => {
  await signIn(page, 'admin');
  const nav = await wholeNav(page);
  for (const name of [...WORK_ROWS, ...ADMIN_ROWS, 'Workspaces']) {
    await expect(nav.getByRole('link', { name, exact: true }), name).toBeVisible();
  }

  await nav.getByRole('link', { name: 'Pages', exact: true }).click();
  const main = page.getByRole('main');
  for (const p of Object.values(PAGES)) {
    await expect(main.getByText(p.title, { exact: true }), p.title).toBeVisible();
  }
  expect(api.asked('admin')).toContain('GET /api/tree/pages');

  await nav.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/settings/users');
  await expect(main.getByText(LOGINS.member.name).first()).toBeVisible();
  await expect(main.getByText(LOGINS.client.name).first()).toBeVisible();
  // The email code entry is for client logins (the brain sends codes to
  // them only).
  await expect(main.getByText('For client logins')).toBeVisible();
  await expect(page.getByText('You cannot manage this part of the brain.')).toHaveCount(0);
  const asked = api.asked('admin');
  for (const read of ['/api/users', '/api/team-admin/invites', '/api/team-admin/member-chats']) {
    expect(asked, read).toContain(`GET ${read}`);
  }
  expect(asked.filter((r) => /\/api\/(client|member)\//.test(r))).toEqual([]);
  // The routes a W5c brain answers 410: never asked.
  expect(asked.filter((r) => GONE.test(r))).toEqual([]);
  // The admin's live updates are the owner stream.
  expect(asked).not.toContain('GET /api/member/realtime');
});
