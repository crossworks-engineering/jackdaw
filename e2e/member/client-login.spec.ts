import { expect, test } from '@playwright/test';
import {
  CLIENT_ITEM_ID,
  CLIENT_ITEM_TITLE,
  CLIENT_SITE,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Client logins C0, C1 and C2 in the browser, against the in-memory API (no
 * brain). A client login that the browser does not yet know as one (no
 * client hint) gets the client portal and nothing of the owner or member
 * shell, on any path, with no loop to /login: the only refused route it
 * asks is the role probe itself, then the client routes. And an admin
 * checks "What clients see" and acknowledges it.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

const portal = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: 'Shared with you' });

const hasCookie = async (context: import('@playwright/test').BrowserContext, name: string) =>
  (await context.cookies()).some((c) => c.name === name && c.value === '1');

test.describe('a client login', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    // A signed-in browser with no hint: the shell must ask first.
    await signInAsAdmin(context, baseURL!);
  });

  test('gets the client portal, never the owner shell', async ({ page, context }) => {
    await page.goto('/');
    await expect(portal(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: `${CLIENT_SITE} home` }).first()).toBeVisible();
    // No owner or member nav: the one screen.
    await expect(page.getByRole('link', { name: 'Pages' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    // The one refused route it asked is the role probe: nothing else of the
    // owner shell (usage card, activity, banners, the page) was requested.
    expect([...new Set(api.clientCalls)]).toEqual(['GET /api/shell']);
    // From now on the browser knows: the next load asks no owner route.
    await expect.poll(() => hasCookie(context, 'mantle_client')).toBe(true);
  });

  test('a deep link to an owner screen shows the portal and goes home (no loop)', async ({
    page,
  }) => {
    await page.goto('/team-admin?view=shares');
    await expect(portal(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/$/);
    expect([...new Set(api.clientCalls)]).toEqual(['GET /api/shell']);
  });

  test('signs out through /api/auth/logout and lands on the client sign-in page', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await expect(portal(page)).toBeVisible({ timeout: 60_000 });
    await page
      .getByRole('button', { name: /^Account/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/client-signin$/, { timeout: 30_000 });
    expect(api.logouts.map((l) => l.path)).toContain('/api/auth/logout');
    expect(await hasCookie(context, 'mantle_client')).toBe(false);
  });
});

test.describe('a client login with a stale member hint', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsMember(context, baseURL!);
  });

  test('gets the client portal, and the member hint is dropped', async ({ page, context }) => {
    await page.goto('/pages');
    await expect(portal(page)).toBeVisible({ timeout: 60_000 });
    expect(api.clientCalls).not.toContain('GET /api/shell');
    await expect.poll(() => hasCookie(context, 'mantle_member')).toBe(false);
    await expect.poll(() => hasCookie(context, 'mantle_client')).toBe(true);
  });
});

test.describe('What clients see', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  test('lists the client items and records the check with the ids shown', async ({ page }) => {
    await page.goto('/team-admin?view=clients');
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByText('Every client login will be able to read all of it.'),
    ).toBeVisible();
    await expect(page.getByText('Internal pricing (Team)')).toBeVisible();
    await expect(page.getByText('Nobody has checked this list yet.')).toBeVisible();
    // Before any check the brain names every item as new: none is marked.
    await expect(page.getByText('New since checked')).toHaveCount(0);
    // A ref outside the brain: never its title.
    await expect(page.getByText(/An item outside the brain/)).toBeVisible();

    await page.getByRole('button', { name: 'I have checked this list' }).click();
    const ack = page.getByTestId('client-report-ack');
    await expect(ack).toHaveText(/Ada Admin checked this list on/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'I have checked this list' })).toHaveCount(0);
    // The keyboard lands on the line that says who checked it.
    await expect(ack).toBeFocused();
    // The whole set, by its fingerprint (a current brain).
    expect(api.admin.clientAckBodies).toEqual([{ fingerprint: `fp-${CLIENT_ITEM_ID}` }]);
    expect(api.admin.clientAcks).toEqual([[CLIENT_ITEM_ID]]);
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/team-admin?view=clients');
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    // No sideways scroll of the page itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: 'I have checked this list' })).toBeInViewport();
  });
});
