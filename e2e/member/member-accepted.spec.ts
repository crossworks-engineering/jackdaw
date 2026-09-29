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
 * Phase 4), in the ONE list (item-list alignment): it lists beside the
 * member's own items, marked "by you", and the State filter's "By me"
 * narrows the list to it. The mock's accepted page sits at the ADMIN level,
 * so the Library does not list it: it is its own accepted row, read-only,
 * as accepted. Runs against the in-memory member API, no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

const byMe = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'Filter by state' }).click();
  await page.getByRole('menuitemradio', { name: 'By me' }).click();
};

test('the one list shows the accepted item beside own ones; By me narrows to it', async ({
  page,
}) => {
  await page.goto('/pages');
  // Everything the member can see, by default: no source to pick first.
  await expect(page.getByText(PAGE_TITLE).first()).toBeVisible({ timeout: 60_000 });
  const accepted = page.locator(`[data-item-id="${ACCEPTED_ID}"]`);
  await expect(accepted).toBeVisible();
  await expect(accepted).toContainText('by you');
  // The own item wears its state as a pill; the brain's item wears none.
  await expect(page.locator('[data-state="private"]').first()).toBeVisible();
  await expect(accepted.locator('[data-state]')).toHaveCount(0);

  await byMe(page);
  await expect(page).toHaveURL(/\/pages\?state=by-me$/);
  await expect(page.getByText(PAGE_TITLE)).toHaveCount(0);
  expect(api.itemsStates).toContain('by-me');

  await accepted.click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?state=by-me&src=accepted&id=${ACCEPTED_ID}$`));
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

test('a kind with nothing accepted says so under By me', async ({ page }) => {
  await page.goto('/notes?state=by-me');
  await expect(page.getByText('No notes match this filter.')).toBeVisible({ timeout: 60_000 });
  expect(api.adminCalls).toEqual([]);
});

test('on a brain without the one-list route the client merges the sources itself', async ({
  page,
}) => {
  api.itemsRoute = false;
  await page.goto('/pages');
  await expect(page.getByText(PAGE_TITLE).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(`[data-item-id="${ACCEPTED_ID}"]`)).toContainText('by you');
  expect(api.itemsStates).toEqual([]);
  expect(api.adminCalls).toEqual([]);
});
