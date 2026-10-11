import { expect, test } from '@playwright/test';
import {
  PAGES,
  WORKSPACES,
  signIn,
  startMockWorkspaceApi,
  type MockWorkspaceApi,
} from './mock-workspace-api';
import {
  ANY_LOGIN,
  ANY_STREAM,
  GONE_ROUTE,
  MEMBER_OPEN,
  WORK_ROWS,
  outside,
  outsideRoutes,
  wholeNav,
} from './shell-nav';

/**
 * A client in the one shell (phases W5c and W6b): the plain home with its
 * workspaces, and the owner Pages screen, which reads the owner routes in
 * the client's scope (W6b: one data source for every login). It asks no
 * /api/client/* and no /api/member/* route (the client portal and the member
 * shell are gone) and no owner route the brain did not open to it.
 * In-memory brain, no real one.
 */
let api: MockWorkspaceApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockWorkspaceApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

test('the plain home lists the client workspaces; Pages reads the owner tree in its scope', async ({
  page,
}) => {
  await signIn(page, 'client');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(main.getByRole('link', { name: WORKSPACES.desk.name })).toBeVisible();
  for (const ws of [WORKSPACES.team, WORKSPACES.field, WORKSPACES.board, WORKSPACES.admin]) {
    await expect(main.getByText(ws.name, { exact: true }), ws.name).toHaveCount(0);
  }
  const nav = await wholeNav(page, 'client');
  for (const name of [...WORK_ROWS, 'Workspaces']) {
    await expect(nav.getByRole('link', { name, exact: true }), name).toBeVisible();
  }

  await page.goto('/pages');
  await expect.poll(() => api.asked('client')).toContain('GET /api/tree/pages');
  // Client desk holds no page: none of the brain's pages shows.
  for (const p of Object.values(PAGES)) {
    await expect(page.getByText(p.title, { exact: true }), p.title).toHaveCount(0);
  }

  const asked = api.asked('client');
  expect(asked.filter((r) => /\/api\/(client|member)\//.test(r))).toEqual([]);
  expect(asked.filter((r) => GONE_ROUTE.test(r.slice(r.indexOf(' ') + 1)))).toEqual([]);
  expect(outsideRoutes(outside(asked, ANY_LOGIN), MEMBER_OPEN)).toEqual([]);
  // A client has no live-update stream of its own.
  expect(asked.filter((r) => ANY_STREAM.test(r))).toEqual([]);
});
