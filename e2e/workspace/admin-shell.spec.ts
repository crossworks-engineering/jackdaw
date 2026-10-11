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
  await expect(page.getByText('You cannot manage this part of the brain.')).toHaveCount(0);
  expect(api.asked('admin').filter((r) => /\/api\/(client|member)\//.test(r))).toEqual([]);
});
