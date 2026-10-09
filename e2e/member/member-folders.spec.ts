import { expect, test } from '@playwright/test';
import {
  LIBRARY_TITLE,
  PAGE_ID,
  PAGE_TITLE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A member's workspace is the admin's folder view (2026-10-09): the item
 * tree only, no list, no List/Folders switch, no State filter. Old list
 * links land in the folders. Runs against the in-memory member API, no
 * brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  api.libraryList = true;
  await signInAsMember(context, baseURL!);
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('mantle_tour:member', 'done');
    } catch {
      // A browser that blocks storage just sees the tour.
    }
  });
});
test.afterEach(async () => {
  await api.close();
});

for (const [path, many] of [
  ['/pages', 'pages'],
  ['/notes', 'notes'],
  ['/draw', 'drawings'],
  ['/tables', 'tables'],
  ['/files', 'files'],
] as const) {
  test(`${path} opens the folder tree, with no list or view switch`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('tree')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('treeitem', { name: new RegExp(`^All ${many}`) })).toBeVisible();
    await expect(page.getByRole('group', { name: 'List or folders' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All items' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(0);
    expect(api.memberTreeReads.length).toBeGreaterThan(0);
    expect(api.adminCalls).toEqual([]);
  });
}

test('an item opens from the tree, and the tree search finds it', async ({ page }) => {
  await page.goto('/pages');
  await page.getByRole('treeitem').filter({ hasText: LIBRARY_TITLE }).click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/pages\?src=library&id=/);
  await expect(page.getByRole('heading', { name: LIBRARY_TITLE })).toBeVisible();

  await page.goto('/pages');
  await page.getByPlaceholder('Search pages and folders…').fill('field');
  await expect(page).toHaveURL(/[?&]q=field/, { timeout: 15_000 });
  await expect(page.getByRole('treeitem').filter({ hasText: PAGE_TITLE })).toBeVisible();
  await expect(page.getByRole('treeitem').filter({ hasText: LIBRARY_TITLE })).toHaveCount(0);
  expect(api.memberTreeReads).toContain('pages/search');
});

test('an old list link lands in the folders, keeping the open item', async ({ page }) => {
  await page.goto(`/pages?view=folders&state=private&page=2&id=${PAGE_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`), { timeout: 60_000 });
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(page.locator('.ProseMirror')).toContainText('Start.', { timeout: 60_000 });
});

test('a brain before folder sharing says so instead of a list', async ({ page }) => {
  api.memberTree = false;
  await page.goto('/notes');
  await expect(
    page.getByText('Folders need a newer brain. Ask an admin to update it.'),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tree')).toHaveCount(0);
});

test('a phone shows the tree, then the item, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/pages');
  await expect(page.getByRole('tree')).toBeVisible({ timeout: 60_000 });
  const sideways = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  expect(await sideways()).toBe(false);
  await page.getByRole('treeitem').filter({ hasText: PAGE_TITLE }).click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`));
  await expect(page.getByRole('tree')).toBeHidden();
  expect(await sideways()).toBe(false);
  await page.goBack();
  await expect(page.getByRole('tree')).toBeVisible();
});
