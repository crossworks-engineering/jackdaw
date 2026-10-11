import { expect, test } from '@playwright/test';
import {
  ADMIN_OWN_ID,
  ADMIN_OWN_TITLE,
  MEMBER_NAME,
  SUBMITTED_ID,
  SUBMITTED_TITLE,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A taken item (audit F07), the admin's side: an item an admin took from a
 * member sits in their own private items, where they give it back or accept
 * it into the brain. Take over itself went with the review flow in W5c.
 * Runs against the in-memory API in its admin role (mock-member-api.ts), no
 * brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
  await signInAsAdmin(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

test('Give back sends no note, and the item leaves the Pages list', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID, ADMIN_OWN_ID];
  await page.goto(`/pages?pid=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Give back' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Give back to ${MEMBER_NAME}` })).toBeVisible();
  // No note field: review flows carry no messages.
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Give back', exact: true }).click();

  await expect(page.getByText(`Gave “${SUBMITTED_TITLE}” back to ${MEMBER_NAME}.`)).toBeVisible({
    timeout: 15_000,
  });
  // Only the fixed line an older brain needs (client/web/lib/review-no-note.ts).
  expect(api.admin.giveBacks).toEqual([{ id: SUBMITTED_ID, note: 'Sent back for changes.' }]);
  await expect(page.locator(`[data-item-id="${SUBMITTED_ID}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-item-id="${ADMIN_OWN_ID}"]`)).toBeVisible();
});

test('a refused Give back stays in the dialog and names the items to remove', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID, ADMIN_OWN_ID];
  api.admin.giveBackAnswer = {
    status: 409,
    body: { error: 'uses things', reason: 'embed', ids: [ADMIN_OWN_ID] },
  };
  await page.goto(`/pages?pid=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Give back' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Give back', exact: true }).click();

  const notice = dialog.getByRole('status');
  await expect(notice).toContainText('Remove these, save a version, then give it back:', {
    timeout: 15_000,
  });
  const link = notice.getByRole('link', { name: ADMIN_OWN_TITLE });
  await expect(link).toHaveAttribute('href', `/pages?pid=${ADMIN_OWN_ID}`);
  // Still open, nothing moved.
  await expect(dialog.getByRole('heading', { name: `Give back to ${MEMBER_NAME}` })).toBeVisible();
  expect(api.admin.privateIds).toContain(SUBMITTED_ID);

  api.admin.giveBackAnswer = {
    status: 409,
    body: { error: 'gone', reason: 'author-inactive' },
  };
  await dialog.getByRole('button', { name: 'Give back', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Accept it into the brain, or delete it.', {
    timeout: 15_000,
  });
});

test('once its member cannot take it back: no Give back, and Delete is offered', async ({
  page,
}) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID];
  api.admin.authorActive = false;
  await page.goto(`/pages?pid=${SUBMITTED_ID}`);
  await expect(page.getByText(`${MEMBER_NAME} cannot take this back any more.`)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('button', { name: 'Give back' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted.')).toBeVisible({ timeout: 15_000 });
  expect(api.admin.deletes).toEqual([SUBMITTED_ID]);
});

test('Accept into brain works on a taken item as on the admin’s own', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID];
  await page.goto(`/pages?pid=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Accept into brain' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`by ${MEMBER_NAME}`);
  await expect(dialog).toContainText(`${MEMBER_NAME} sees it under Accepted.`);
  await dialog.getByRole('button', { name: 'Accept into the brain' }).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${SUBMITTED_ID}$`), { timeout: 15_000 });
  expect(api.admin.accepts.map((a) => a.id)).toEqual([SUBMITTED_ID]);
});

test('an old Private-view link lands on the item in the Pages list', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID, ADMIN_OWN_ID];
  await page.goto(`/pages?space=private&id=${SUBMITTED_ID}`);
  await expect(page).toHaveURL(new RegExp(`/pages\\?pid=${SUBMITTED_ID}$`), { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Give back' })).toBeVisible({ timeout: 30_000 });
  // No Brain / Private switch any more: one list, the state as a pill.
  await expect(page.getByRole('radio', { name: 'Private' })).toHaveCount(0);
  await expect(page.locator(`[data-item-id="${ADMIN_OWN_ID}"]`)).toContainText('private');
});
