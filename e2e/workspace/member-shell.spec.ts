import { expect, test } from '@playwright/test';
import { PAGES, signIn, startMockWorkspaceApi, type MockWorkspaceApi } from './mock-workspace-api';
import {
  ADMIN_ROWS,
  ANY_LOGIN,
  KNOWN_SHARED_STREAM,
  WORK_ROWS,
  outside,
  wholeNav,
} from './shell-nav';

/**
 * A member in the one shell (phase W5c). Signs in through the real /login
 * form, then: the normal rail and nav with no Admin rows, a switcher that
 * lists exactly the member's workspaces, and a Pages screen that reads the
 * member routes only, never an owner route, and shows only the items of the
 * member's workspaces. Runs against the in-memory brain, no real one.
 */
let api: MockWorkspaceApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockWorkspaceApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

/** What a member may ask: its own routes and what every login asks. */
const MEMBER_MAY = [...ANY_LOGIN, /^\/api\/member\//, KNOWN_SHARED_STREAM];

test('the rail: the work screens and Workspaces, no Admin rows', async ({ page }) => {
  await signIn(page, 'member');
  const nav = await wholeNav(page);
  for (const name of [...WORK_ROWS, 'Workspaces']) {
    await expect(nav.getByRole('link', { name, exact: true }), name).toBeVisible();
  }
  for (const name of ADMIN_ROWS) {
    await expect(nav.getByRole('link', { name, exact: true }), name).toHaveCount(0);
  }
});

test('the switcher lists exactly the member workspaces', async ({ page }) => {
  await signIn(page, 'member');
  await page
    .getByRole('button', { name: /^Workspace:/ })
    .first()
    .click();
  // All my workspaces, then each workspace by name; Board room, Admin and
  // Client desk are workspaces of the brain the member is not in.
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'All my workspaces',
    /^Field crew\s*Moderator$/,
    'Team',
  ]);
});

test('Pages lists the member workspaces items from the member routes only', async ({ page }) => {
  await signIn(page, 'member');
  await page.goto('/pages');
  const main = page.getByRole('main');
  await expect(main.getByText(PAGES.handbook.title, { exact: true })).toBeVisible();
  await expect(main.getByText(PAGES.survey.title, { exact: true })).toBeVisible();
  // In the brain, in a workspace the member is not in: never on the screen.
  await expect(page.getByText(PAGES.minutes.title)).toHaveCount(0);

  const asked = api.asked('member');
  expect(asked).toContain('GET /api/member/tree/pages');
  expect(asked.filter((r) => /\/api\/(pages|tree)(\/|$|\?)/.test(r))).toEqual([]);
  expect(outside(asked, MEMBER_MAY)).toEqual([]);
});

test('a typed admin screen says the member cannot manage it', async ({ page }) => {
  await signIn(page, 'member');
  for (const path of ['/settings/users', '/runs']) {
    await page.goto(path);
    await expect(page.getByText('You cannot manage this part of the brain.'), path).toBeVisible();
  }
  expect(outside(api.asked('member'), MEMBER_MAY)).toEqual([]);
});

test('the retired review and Team admin screens land on the home', async ({ page }) => {
  await signIn(page, 'member');
  for (const path of ['/review', '/team-admin']) {
    await page.goto(path);
    await expect(page, path).toHaveURL((u) => u.pathname === '/');
  }
});
