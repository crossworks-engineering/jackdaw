import { expect, test } from '@playwright/test';
import {
  ACCEPTED_AT,
  ACCEPTED_ID,
  ACCEPTED_TITLE,
  PAGE_TITLE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The Accepted source (member logins, Phase 4): what the member wrote and an
 * admin accepted into the brain, read-only, at any level. The mock's accepted
 * page sits at the ADMIN level, so neither Mine nor the Library has it: only
 * /api/member/accepted does. Runs against the in-memory member API, no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

const acceptedOn = new Date(ACCEPTED_AT).toLocaleDateString('en-US');

test('the Accepted source lists the item and opens it read-only', async ({ page }) => {
  await page.goto('/pages');
  await expect(page.getByText(PAGE_TITLE).first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('radio', { name: 'Accepted' }).click();
  await expect(page).toHaveURL(/\/pages\?src=accepted$/);
  // Mine's item is not in this list; the accepted one is, with where it sits.
  await expect(page.getByText(PAGE_TITLE)).toHaveCount(0);
  const card = page.getByText(ACCEPTED_TITLE).first();
  await expect(card).toBeVisible();
  await expect(page.getByText(`Accepted ${acceptedOn} · Admins only`)).toBeVisible();

  await card.click();
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

test('an accepted item route opens it in Accepted', async ({ page }) => {
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

test('a kind with nothing accepted says so', async ({ page }) => {
  await page.goto('/notes?src=accepted');
  await expect(
    page.getByText('None of your notes has been accepted into the brain yet.'),
  ).toBeVisible({ timeout: 60_000 });
  expect(api.adminCalls).toEqual([]);
});
