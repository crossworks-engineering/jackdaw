import { expect, test, type Page } from '@playwright/test';
import {
  MEMBER_PASSWORD,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A member's own chrome (member logins, Phase 5): the member tour, the
 * account menu's password change, and the contract banner. Runs against the
 * in-memory member API (mock-member-api.ts), no brain; every admin route the
 * page calls is recorded, and each test ends with none.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

const tourCard = (page: Page) => page.locator('[data-tour-card]');

/** The tour opens by itself on a member's first visit to Home; a test about
 *  something else says it has seen it. */
async function skipTour(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('mantle_tour:member', 'done');
    } catch {
      // A browser that blocks storage just sees the tour.
    }
  });
}

test('the member tour opens once on Home and walks only member screens', async ({ page }) => {
  await page.goto('/');
  const card = tourCard(page);
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText('Welcome');

  const seen: string[] = [];
  for (let i = 0; i < 20; i++) {
    const titleId = await card.getAttribute('aria-labelledby');
    const title = (await page.locator(`[id="${titleId}"]`).textContent())?.trim() ?? '';
    seen.push(title);
    const finish = card.getByRole('button', { name: 'Finish' });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await card.getByRole('button', { name: 'Next' }).click();
    // A step that moved screens lands on a member screen, never /login or an
    // admin path the middleware would bounce.
    await expect(page).toHaveURL(/\/(pages|apps)?$/);
  }
  await expect(card).toHaveCount(0);
  expect(seen.length).toBeGreaterThan(3);
  expect(seen.at(-1)).toContain('Your account');

  // Finished: Home again does not reopen it.
  await page.goto('/');
  await expect(page.locator('[data-tour="nav:/pages"]').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await expect(card).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});

test('an open tour step does not pull the member back to its screen', async ({ page }) => {
  // The member bounce (2026-10-03): with the Welcome card open on Home, a
  // click on Pages landed on Pages and was pushed back to Home a moment
  // later, every time, until the tour was closed.
  await page.goto('/');
  const card = tourCard(page);
  await expect(card).toContainText('Welcome', { timeout: 60_000 });

  await page.locator('[data-tour="nav:/pages"] >> visible=true').first().click();
  await expect(page).toHaveURL(/\/pages$/);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/pages$/);
  await page.locator('[data-tour="nav:/notes"] >> visible=true').first().click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/notes$/);

  // The tour still walks: Next opens the next step on its own screen.
  await expect(card).toContainText('Welcome');
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Your home');
  await expect(page).toHaveURL(/\/$/);
  expect(api.adminCalls).toEqual([]);
});

test('every target the member tour names is on the member shell', async ({ page }) => {
  await skipTour(page);
  await page.goto('/pages');
  await expect(page.locator('[data-tour="member-tree"]').first()).toBeVisible({
    timeout: 60_000,
  });
  for (const target of [
    'brand',
    'main',
    'profile',
    'nav:/',
    'nav:/pages',
    'nav:/apps',
    'nav:#chat',
  ]) {
    // The account menu renders twice (rail and phone bar); one is hidden.
    await expect(page.locator(`[data-tour="${target}"] >> visible=true`).first()).toBeVisible();
  }
  expect(api.adminCalls).toEqual([]);
});

test('a link to an admin tour starts nothing for a member', async ({ page }) => {
  await skipTour(page);
  await page.goto('/pages?tour=demo');
  await expect(page.locator('[data-tour="nav:/pages"]').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await expect(tourCard(page)).toHaveCount(0);
  // Nothing drags the member back to a tour screen.
  await page.locator('[data-tour="nav:/notes"]').first().click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/notes$/);
  expect(api.adminCalls).toEqual([]);
});

test('Take the tour in the account menu starts it again', async ({ page }) => {
  await skipTour(page);
  await page.goto('/pages');
  await page
    .getByRole('button', { name: /^Account/ })
    .first()
    .click({ timeout: 60_000 });
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(tourCard(page)).toContainText('Welcome');
  await expect(page).toHaveURL(/\/$/);
  expect(api.adminCalls).toEqual([]);
});

test('a member changes their password; a wrong current one stays on the form', async ({ page }) => {
  await skipTour(page);
  await page.goto('/pages');
  await page
    .getByRole('button', { name: /^Account/ })
    .first()
    .click({ timeout: 60_000 });
  // No admin Profile screen for a member.
  await expect(page.getByRole('menuitem', { name: 'Profile' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Change password' }).click();

  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await expect(dialog).toBeVisible();
  // Checked before anything is sent.
  await dialog.getByLabel('Current password').fill('whatever');
  await dialog.getByLabel('New password', { exact: true }).fill('short');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText('Use at least 8 characters.')).toBeVisible();
  expect(api.passwordChanges).toEqual([]);

  // A wrong current password is a 401 from the brain: the form says so, and
  // the member is NOT sent to sign in.
  await dialog.getByLabel('Current password').fill('not-my-password');
  await dialog.getByLabel('New password', { exact: true }).fill('second-password-2');
  await dialog.getByLabel('New password again').fill('second-password-2');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText('That is not your current password.')).toBeVisible();
  await expect(page).toHaveURL(/\/pages$/);

  await dialog.getByLabel('Current password').fill(MEMBER_PASSWORD);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Password changed. Other devices were signed out.')).toBeVisible();
  expect(api.passwordChanges.at(-1)).toEqual({
    oldPassword: MEMBER_PASSWORD,
    newPassword: 'second-password-2',
  });
  expect(api.adminCalls).toEqual([]);
});

test('a member signs out everywhere: confirmed first, then signed out here too', async ({
  page,
  context,
}) => {
  await skipTour(page);
  await page.goto('/pages');
  const account = page.getByRole('button', { name: /^Account/ }).first();
  await account.click({ timeout: 60_000 });
  await page.getByRole('menuitem', { name: 'Sign out everywhere' }).click();

  const confirm = page.getByRole('alertdialog', { name: 'Sign out everywhere?' });
  await expect(confirm).toContainText('This signs you out on every device, this one too.');
  // Cancel sends nothing.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.logouts).toEqual([]);

  await account.click();
  await page.getByRole('menuitem', { name: 'Sign out everywhere' }).click();
  await confirm.getByRole('button', { name: 'Sign out everywhere' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 60_000 });
  expect(api.logouts[0]).toEqual({ path: '/api/auth/logout', body: { everywhere: true } });
  // Then the ordinary sign-out: this browser forgets the session.
  expect(api.logouts.some((l, i) => i > 0 && l.path === '/api/auth/logout')).toBe(true);
  const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
  expect(cookies.mantle_member ?? '').toBe('');
  expect(api.adminCalls).toEqual([]);
});

test('a contract mismatch tells a member to ask an admin, with no admin link', async ({ page }) => {
  await skipTour(page);
  api.version = { version: 'mock', contractVersion: 999 };
  await page.goto('/pages');
  await expect(page.getByText('Needs an update: tell an admin').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('a[href="/settings/updates"]')).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});
