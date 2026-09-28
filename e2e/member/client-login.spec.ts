import { expect, test } from '@playwright/test';
import {
  CLIENT_ITEM_ID,
  CLIENT_ITEM_TITLE,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Client logins C0 and C1 in the browser, against the in-memory API (no
 * brain). A client login gets the neutral client screen and nothing of the
 * owner or member shell, on any path, with no loop to /login; the only
 * routes it asks are the role probe itself. And an admin checks "What
 * clients see" and acknowledges it.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

const CLIENT_TEXT = 'This account is a client login.';

test.describe('a client login', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    // A signed-in browser with no member hint: the shell must ask first.
    await signInAsAdmin(context, baseURL!);
  });

  test('gets the neutral client screen, never the owner shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(CLIENT_TEXT)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('The client portal is not available yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // No rail, no nav, no page.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    // The one route it asked is the role probe: nothing else of the owner
    // shell (usage card, activity, banners, the page) was requested.
    expect([...new Set(api.clientCalls)]).toEqual(['GET /api/shell']);
  });

  test('a deep link to an owner screen shows the same, and stays put (no loop)', async ({
    page,
  }) => {
    await page.goto('/team-admin?view=shares');
    await expect(page.getByText(CLIENT_TEXT)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe('/team-admin');
    expect([...new Set(api.clientCalls)]).toEqual(['GET /api/shell']);
  });

  test('signs out through /api/auth/logout and lands on /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    expect(api.logouts.map((l) => l.path)).toContain('/api/auth/logout');
  });
});

test.describe('a client login with a stale member hint', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsMember(context, baseURL!);
  });

  test('gets the client screen, and the hint is dropped', async ({ page, context }) => {
    await page.goto('/pages');
    await expect(page.getByText(CLIENT_TEXT)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('navigation')).toHaveCount(0);
    expect(api.clientCalls).not.toContain('GET /api/shell');
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'mantle_member'))
      .toBe(false);
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

    await page.getByRole('button', { name: 'I have checked this list' }).click();
    await expect(page.getByText(/Ada Admin checked this list on/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'I have checked this list' })).toHaveCount(0);
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
