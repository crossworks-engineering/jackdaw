import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { AppDetail, ClientAppCard, MemberAppCard } from '@mantle/client-types';
import {
  ADMIN_APP_ID,
  ADMIN_APP_TITLE,
  APP_FRAME_TEXT,
  CLIENT_APP_ID,
  CLIENT_APP_TITLE,
  CLIENT_INFO_APP_ID,
  CLIENT_INFO_APP_TITLE,
  CLIENT_NOTE_ID,
  CLIENT_NOTE_TITLE,
  MEMBER_INFO_APP_ID,
  MEMBER_INFO_APP_TITLE,
  OWNER_THREAD_CLIENT_COMMENT,
  OWNER_THREAD_TEAM_COMMENT,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Client apps (client logins C6), against the in-memory API (no brain): a
 * client opens Apps beside "Shared with you" and My requests and runs an app
 * over the client routes; an informational app says so; a brain before C6
 * (or one with no client apps) shows no Apps. The other sides: a member's
 * informational app says so the same way, an admin's switch sends the flag,
 * and the owner's client thread is read by scope.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

async function signInAsClient(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_client', value: '1', url: baseURL },
  ]);
}

const NOTE = /^Informational: you can read this app.s data, not change it\.$/;
const at = '2026-09-30T08:00:00.000Z';
const clientApp = (id: string, title: string, dataReadOnly: boolean): ClientAppCard => ({
  id,
  title,
  icon: null,
  color: null,
  description: `${title} for the site`,
  updatedAt: at,
  dataReadOnly,
});
const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const appsList = (page: Page) => page.getByRole('list', { name: 'Apps' });
const appsAsked = () => api.clientRouteCalls.filter((c) => c === 'GET /api/client/apps').length;

test.describe('a client’s apps', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('Apps sits beside My requests; a client runs an app over the client routes', async ({
    page,
  }) => {
    api.clientApps.apps = [
      clientApp(CLIENT_APP_ID, CLIENT_APP_TITLE, false),
      clientApp(CLIENT_INFO_APP_ID, CLIENT_INFO_APP_TITLE, true),
    ];
    await page.goto('/');
    await expect(nav(page).getByRole('link')).toHaveText(
      ['Shared with you', 'My requests', 'Apps'],
      { timeout: 60_000 },
    );
    await nav(page).getByRole('link', { name: 'Apps' }).click();
    await expect(page).toHaveURL(/\/\?view=apps$/);
    await expect(nav(page).getByRole('link', { name: 'Apps' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(appsList(page).getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
    // Only the informational app wears its tag.
    const plain = appsList(page).locator('[data-item-id]').filter({ hasText: CLIENT_APP_TITLE });
    const info = appsList(page)
      .locator('[data-item-id]')
      .filter({ hasText: CLIENT_INFO_APP_TITLE });
    await expect(info).toContainText('Informational');
    await expect(plain).not.toContainText('Informational');
    // The search narrows the cards.
    await page.getByRole('textbox', { name: 'Search apps' }).fill('programme');
    await expect(appsList(page).getByRole('listitem')).toHaveCount(1);
    await page.getByRole('textbox', { name: 'Search apps' }).fill('');

    await plain.getByRole('button', { name: CLIENT_APP_TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`\\?view=apps&id=${CLIENT_APP_ID}$`));
    await expect(page.getByRole('heading', { name: CLIENT_APP_TITLE })).toBeVisible();
    // The sandbox runs over the client base: its ticket, then its frame.
    const frame = page.locator('iframe');
    await expect(frame).toHaveAttribute(
      'src',
      new RegExp(`/api/client/apps/${CLIENT_APP_ID}/frame\\?t=ticket-${CLIENT_APP_ID}`),
      { timeout: 30_000 },
    );
    await expect(page.frameLocator('iframe').getByText(APP_FRAME_TEXT)).toBeAttached();
    // (Dev mode runs the ticket effect twice; every ticket is for this app.)
    expect(new Set(api.clientApps.tickets)).toEqual(new Set([CLIENT_APP_ID]));
    expect(new Set(api.clientApps.frames)).toEqual(new Set([CLIENT_APP_ID]));
    // A writable app says nothing about reading only.
    await expect(page.getByRole('note')).toHaveCount(0);
    // Never a member or admin route.
    expect(api.clientCalls).toEqual([]);

    await page.getByRole('link', { name: 'Apps', exact: true }).last().click();
    await expect(page).toHaveURL(/\/\?view=apps$/);
    await expect(appsList(page).getByRole('listitem')).toHaveCount(2);
  });

  test('an informational app says so, quietly, and still runs', async ({ page }) => {
    api.clientApps.apps = [clientApp(CLIENT_INFO_APP_ID, CLIENT_INFO_APP_TITLE, true)];
    await page.goto(`/?view=apps&id=${CLIENT_INFO_APP_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_INFO_APP_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('note')).toHaveText(NOTE);
    await expect(page.frameLocator('iframe').getByText(APP_FRAME_TEXT)).toBeAttached({
      timeout: 30_000,
    });
    expect(new Set(api.clientApps.frames)).toEqual(new Set([CLIENT_INFO_APP_ID]));
  });

  test('an app the client may not run says so', async ({ page }) => {
    api.clientApps.apps = [clientApp(CLIENT_APP_ID, CLIENT_APP_TITLE, false)];
    await page.goto(`/?view=apps&id=${CLIENT_INFO_APP_ID}`);
    await expect(page.getByText('This app is not available to you.')).toBeVisible({
      timeout: 60_000,
    });
    expect(api.clientApps.tickets).toEqual([]);
  });

  test('a brain with no client apps shows no Apps', async ({ page }) => {
    await page.goto('/');
    await expect.poll(appsAsked, { timeout: 60_000 }).toBe(1);
    await expect(nav(page).getByRole('link')).toHaveText(['Shared with you', 'My requests']);
  });

  test('a brain before C6 shows no Apps, and is asked once', async ({ page }) => {
    api.clientApps.routes = false;
    await page.goto('/');
    await expect.poll(appsAsked, { timeout: 60_000 }).toBe(1);
    await expect(nav(page).getByRole('link')).toHaveText(['Shared with you', 'My requests']);
    // A focus refresh asks the portal's lists again, but not a missing route.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect
      .poll(() => api.clientRouteCalls.filter((c) => c.startsWith('GET /api/client/shared')).length)
      .toBeGreaterThan(1);
    expect(appsAsked()).toBe(1);
    // An old link to the screen says so, quietly.
    await page.goto('/?view=apps');
    await expect(page.getByText('Apps are not available here yet.')).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('a member’s informational app', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin);
    await signInAsMember(context, baseURL!);
  });

  const memberApp = (dataReadOnly?: boolean): MemberAppCard => ({
    id: MEMBER_INFO_APP_ID,
    title: MEMBER_INFO_APP_TITLE,
    icon: null,
    color: null,
    description: null,
    audience: 'team',
    updatedAt: at,
    ...(dataReadOnly === undefined ? {} : { dataReadOnly }),
  });

  test('the card and the run view say so', async ({ page }) => {
    api.memberApps.apps = [memberApp(true)];
    await page.goto('/apps');
    const cardLink = page.getByRole('link', { name: new RegExp(MEMBER_INFO_APP_TITLE) });
    await expect(cardLink).toContainText('Informational', { timeout: 60_000 });
    await cardLink.click();
    await expect(page).toHaveURL(new RegExp(`/apps/${MEMBER_INFO_APP_ID}$`));
    await expect(page.getByRole('note')).toHaveText(NOTE, { timeout: 30_000 });
    await expect(page.locator('iframe')).toHaveAttribute(
      'src',
      new RegExp(`/api/member/apps/${MEMBER_INFO_APP_ID}/frame\\?`),
      { timeout: 30_000 },
    );
    expect(api.adminCalls).toEqual([]);
  });

  test('a writable app, or one from a brain before C6, says nothing', async ({ page }) => {
    api.memberApps.apps = [memberApp(undefined)];
    await page.goto(`/apps/${MEMBER_INFO_APP_ID}`);
    await expect(page.locator('iframe')).toHaveAttribute('src', /\/frame\?/, { timeout: 60_000 });
    await expect(page.getByRole('note')).toHaveCount(0);
  });
});

test.describe('an admin', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  const detail = (dataReadOnly?: boolean): AppDetail => ({
    id: ADMIN_APP_ID,
    title: ADMIN_APP_TITLE,
    icon: null,
    color: null,
    tags: [],
    summary: null,
    description: null,
    toolCount: 0,
    hasBuild: false,
    hasDraft: false,
    shareMode: null,
    isHub: false,
    audience: 'client',
    createdAt: at,
    updatedAt: at,
    source: { entry: 'App.tsx', files: { 'App.tsx': 'export default function App() {}' } },
    draft: null,
    manifest: {},
    draftBuild: null,
    publishedBuild: null,
    ...(dataReadOnly === undefined ? {} : { dataReadOnly }),
  });
  const LABEL = 'Informational: members and clients only read its data';

  test('the informational switch sends dataReadOnly, each way', async ({ page }) => {
    api.admin.app = detail(false);
    await page.goto(`/apps/${ADMIN_APP_ID}`);
    const toggle = page.getByRole('switch', { name: LABEL });
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByText('Otherwise a team or client app is written by everyone who runs it.'),
    ).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(() => api.admin.appPatches)
      .toEqual([{ id: ADMIN_APP_ID, body: { dataReadOnly: true } }]);
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => api.admin.appPatches.at(-1)?.body).toEqual({ dataReadOnly: false });
    expect(api.admin.app?.dataReadOnly).toBe(false);
  });

  test('a brain before C6 shows no switch', async ({ page }) => {
    api.admin.app = detail(undefined);
    await page.goto(`/apps/${ADMIN_APP_ID}`);
    await expect(page.getByRole('tab', { name: 'Builder' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('switch', { name: LABEL })).toHaveCount(0);
  });

  test('the client thread is read by scope: only the client thread', async ({ page }) => {
    await page.goto(`/notes?selected=${CLIENT_NOTE_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_NOTE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Client comments (1)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Client comments' });
    await expect(sheet).toContainText(OWNER_THREAD_CLIENT_COMMENT);
    await expect(sheet).not.toContainText(OWNER_THREAD_TEAM_COMMENT);
    expect(api.admin.nodeCommentScopes.length).toBeGreaterThan(0);
    expect(new Set(api.admin.nodeCommentScopes)).toEqual(new Set(['client']));
  });

  test('a brain before C6 ignores the scope: the panel shows what it did before', async ({
    page,
  }) => {
    api.admin.threadScopes = false;
    await page.goto(`/notes?selected=${CLIENT_NOTE_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_NOTE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Client comments (2)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Client comments' });
    await expect(sheet).toContainText(OWNER_THREAD_CLIENT_COMMENT);
    await expect(sheet).toContainText(OWNER_THREAD_TEAM_COMMENT);
  });
});
