import { expect, test } from '@playwright/test';
import {
  ACCEPTED_ID,
  ACCEPTED_TITLE,
  PAGE_TITLE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * What the member wrote and an admin accepted into the brain (member logins,
 * Phase 4), in the folder view (2026-10-09): the member's own items sit in
 * the tree, and the accepted ones show in the "By me (accepted)" section
 * above it. The mock's accepted page sits at the ADMIN level, so the Library
 * does not hold it: it opens read-only, as accepted. Runs against the
 * in-memory member API, no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

const byMeSection = (page: import('@playwright/test').Page) =>
  page.locator('details').filter({ has: page.getByText('By me (accepted)') });

test('the accepted item shows under By me above the folders, own items in the tree', async ({
  page,
}) => {
  await page.goto('/pages');
  // The member's own item is a tree row, wearing its state as a pill.
  const own = page.getByRole('treeitem').filter({ hasText: PAGE_TITLE });
  await expect(own).toBeVisible({ timeout: 60_000 });
  await expect(own.locator('[data-state="private"]')).toBeVisible();
  // The accepted item is in the section, not in the tree.
  const section = byMeSection(page);
  await expect(section).toBeVisible();
  await expect(page.getByRole('treeitem').filter({ hasText: ACCEPTED_TITLE })).toHaveCount(0);
  expect(api.itemsStates).toContain('by-me');

  await section.getByRole('button', { name: new RegExp(ACCEPTED_TITLE) }).click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?src=accepted&id=${ACCEPTED_ID}$`));
  await expect(page.getByRole('heading', { name: ACCEPTED_TITLE })).toBeVisible();
  await expect(page.getByText('Saved survey.')).toBeVisible();
  await expect(
    page.getByText(/You wrote this\. An admin accepted it into the brain/),
  ).toBeVisible();
  await expect(page.getByText('Admins only', { exact: false }).first()).toBeVisible();

  // Read-only: no editor, and none of an own item's actions.
  await expect(page.locator('.ProseMirror[contenteditable="true"]')).toHaveCount(0);
  for (const name of ['Submit', 'Save version', 'Delete', 'Recall']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  expect(api.adminCalls).toEqual([]);
});

test('an accepted item route opens it as accepted', async ({ page }) => {
  await page.goto(`/pages/${ACCEPTED_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?src=accepted&id=${ACCEPTED_ID}$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: ACCEPTED_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('This item is gone.')).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});

test('an old By me list link opens the folders; a kind with nothing accepted has no section', async ({
  page,
}) => {
  await page.goto('/notes?state=by-me');
  await expect(page).toHaveURL(/\/notes$/, { timeout: 60_000 });
  await expect(page.getByRole('tree')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('By me (accepted)')).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});

test('on a brain without the one-list route the section merges the sources itself', async ({
  page,
}) => {
  api.itemsRoute = false;
  await page.goto('/pages');
  await expect(byMeSection(page)).toContainText(ACCEPTED_TITLE, { timeout: 60_000 });
  expect(api.itemsStates).toEqual([]);
  expect(api.adminCalls).toEqual([]);
});
