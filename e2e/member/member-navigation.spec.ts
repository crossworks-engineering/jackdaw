import { expect, test } from '@playwright/test';
import {
  LIBRARY_ID,
  LIBRARY_TITLE,
  PAGE_ID,
  PAGE_TITLE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * How a member moves through a workspace screen: an item's own route opens
 * it from whichever source has it, and picking an item is a history entry
 * (Back on a phone returns to the list instead of leaving the screen).
 * Runs against the in-memory member API (mock-member-api.ts), no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

test('an own item route opens it in Mine', async ({ page }) => {
  await page.goto(`/pages/${PAGE_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`), { timeout: 60_000 });
  await expect(page.locator('.ProseMirror')).toContainText('Start.', { timeout: 60_000 });
});

test('a Library item route opens it in the Library, not as a gone Mine item', async ({ page }) => {
  await page.goto(`/pages/${LIBRARY_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?src=library&id=${LIBRARY_ID}$`), {
    timeout: 60_000,
  });
  await expect(page.getByRole('heading', { name: LIBRARY_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('This item is gone.')).toHaveCount(0);
});

test('an id no source has says so, with a way back', async ({ page }) => {
  await page.goto('/pages/66666666-6666-4666-8666-666666666666');
  await expect(page.getByText('This item is gone, or it is not shared with you.')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Back to Pages' }).click();
  await expect(page).toHaveURL(/\/pages$/);
});

test('Back after picking an item returns to the list', async ({ page }) => {
  await page.goto('/pages');
  await page.getByText(PAGE_TITLE).first().click({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/pages$/);
  await expect(page.getByText(PAGE_TITLE).first()).toBeVisible();

  // Close goes back to that same list entry rather than stacking another.
  await page.getByText(PAGE_TITLE).first().click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${PAGE_ID}$`));
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page).toHaveURL(/\/pages$/);
  expect(api.adminCalls).toEqual([]);
});
