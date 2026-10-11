import { expect, test } from '@playwright/test';
import {
  WORKSPACES,
  signIn,
  startMockWorkspaceApi,
  type MockWorkspaceApi,
} from './mock-workspace-api';
import { ANY_LOGIN, ANY_STREAM, WORK_ROWS, outside, wholeNav } from './shell-nav';

/**
 * A client in the one shell (phase W5c): the plain home with its workspaces,
 * and the empty state on a workspace screen. A client reads no data routes
 * in W5c, so it asks no /api/client/* and no /api/member/* route (the client
 * portal and the member shell are gone). In-memory brain, no real one.
 */
let api: MockWorkspaceApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockWorkspaceApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

test('the plain home lists the client workspaces; Pages shows the empty state', async ({
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
  await expect(
    page.getByText('Nothing to show here yet. Items shared with your workspaces show here soon.'),
  ).toBeVisible();

  const asked = api.asked('client');
  expect(asked.filter((r) => /\/api\/(client|member)\//.test(r))).toEqual([]);
  expect(outside(asked, ANY_LOGIN)).toEqual([]);
  // A client reads no data routes in W5c: it opens no live-update stream.
  expect(asked.filter((r) => ANY_STREAM.test(r))).toEqual([]);
});
