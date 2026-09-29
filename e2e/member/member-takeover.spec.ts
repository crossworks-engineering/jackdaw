import { expect, test } from '@playwright/test';
import {
  BUNDLE_CHILD_ID,
  BUNDLE_CHILD_TITLE,
  CHANGED_FILE_ID,
  CHANGED_FILE_NAME,
  HOLDER_ID,
  HOLDER_TITLE,
  PAGE_ID,
  PAGE_TITLE,
  TAKEN_ID,
  TAKEN_TITLE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Take over (audit F07), the member's side, and the bundle refusals of audit
 * F04. An admin took one of the member's submitted pages into their own
 * private items: Mine lists it "With admin", and nothing of it opens. A page
 * shown inside a submitted one is frozen with it, and says which. Submit
 * names the items it wants saved first. An accepted file an admin changed
 * says so instead of a broken image. Runs against the in-memory member API.
 */
const WITH_ADMIN =
  'An admin is working on this. You will see it again when it is accepted or given back.';

let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
  await signInAsMember(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

test('an item an admin took over lists as with admin and opens nothing', async ({ page }) => {
  api.withAdmin = true;
  await page.goto('/pages');
  const card = page.locator(`[data-item-id="${TAKEN_ID}"]`);
  await expect(card).toBeVisible({ timeout: 60_000 });
  // Its state is the one pill: with admin, not private or draft (who can see
  // it is the admin's business now).
  await expect(card.locator('[data-state]')).toHaveAttribute('data-state', 'with-admin');
  await expect(card).toContainText('with admin');

  await card.click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${TAKEN_ID}$`));
  await expect(page.getByRole('status').filter({ hasText: WITH_ADMIN })).toBeVisible();
  // No editor, no content, and none of an own item's actions (Recall too).
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  for (const name of ['Submit', 'Recall', 'Save version', 'Delete']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  // The list said so: the item's routes were never asked.
  expect(api.withAdminReads).toEqual([]);
  expect(api.adminCalls).toEqual([]);
});

test('taken over after the list was read: its own 409 shows the same notice', async ({ page }) => {
  api.withAdmin = true;
  api.listWithAdmin = false;
  await page.goto(`/pages?id=${TAKEN_ID}`);
  await expect(page.getByRole('status').filter({ hasText: WITH_ADMIN })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Could not load this item.')).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  expect(api.withAdminReads).toContain(`GET /api/member/space/${TAKEN_ID}`);
  expect(api.adminCalls).toEqual([]);
});

test('a link to it says where it is, not that it is gone', async ({ page }) => {
  api.withAdmin = true;
  await page.goto(`/n/${TAKEN_ID}`);
  await expect(page.getByRole('status').filter({ hasText: WITH_ADMIN })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('This item is gone')).toHaveCount(0);
  expect(api.adminCalls).toEqual([]);
});

test('the home lists it under With an admin, not under recent work', async ({ page }) => {
  api.withAdmin = true;
  await page.goto('/');
  const held = page.getByRole('region', { name: 'With an admin' });
  await expect(held).toContainText(TAKEN_TITLE, { timeout: 60_000 });
  await expect(held).toContainText('An admin is working on these.');
  await expect(page.getByRole('region', { name: 'Your recent work' })).not.toContainText(
    TAKEN_TITLE,
  );
  expect(api.adminCalls).toEqual([]);
});

test('a page shown inside a submitted one names it, and links to where Recall is', async ({
  page,
}) => {
  api.bundle = true;
  await page.goto(`/pages?id=${BUNDLE_CHILD_ID}`);
  const editor = page.locator('.ProseMirror');
  await expect(editor).toContainText('Photos of the pump.', { timeout: 60_000 });

  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' More.');

  const held = page.getByRole('status').filter({ hasText: 'which you submitted' });
  await expect(held).toBeVisible({ timeout: 15_000 });
  await expect(held).toContainText(
    `This is part of “${HOLDER_TITLE}”, which you submitted. Recall it to edit.`,
  );
  // The typing stays, read-only, to copy.
  await expect(editor).toContainText('Photos of the pump. More.');
  await expect(editor).toHaveAttribute('contenteditable', 'false');

  await held.getByRole('link', { name: `“${HOLDER_TITLE}”` }).click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${HOLDER_ID}$`));
  await expect(page.getByRole('button', { name: 'Recall' })).toBeVisible({ timeout: 15_000 });
  expect(api.adminCalls).toEqual([]);
});

test('Submit lists the items it wants saved first, each a link', async ({ page }) => {
  api.bundle = true;
  api.submitUnsaved = true;
  await page.goto(`/pages?id=${PAGE_ID}`);
  await expect(page.locator('.ProseMirror')).toContainText('Start.', { timeout: 60_000 });
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(PAGE_TITLE);
  // A member's own item: who can see it, and review (the admin's private
  // item and a client's own have no sharing: admin-takeover and
  // client-requests specs).
  await expect(page.getByRole('radiogroup', { name: 'Who can see this' })).toBeVisible();

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const notice = page.getByRole('status').filter({ hasText: 'Save a version of each' });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  const link = notice.getByRole('link', { name: BUNDLE_CHILD_TITLE });
  await expect(link).toHaveAttribute('href', `/pages?id=${BUNDLE_CHILD_ID}`);
  // Said once, inline: no toast repeating it.
  await expect(page.getByText('Could not submit it.')).toHaveCount(0);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?id=${BUNDLE_CHILD_ID}$`));
  expect(api.adminCalls).toEqual([]);
});

test('an accepted file an admin changed says so, and asks for no bytes', async ({ page }) => {
  api.changedFile = true;
  // The one list shows it beside everything else; it opens as accepted.
  await page.goto('/files');
  const card = page.getByText(CHANGED_FILE_NAME).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/files\\?src=accepted&id=${CHANGED_FILE_ID}$`));
  const note = page.getByRole('status').filter({ hasText: 'An admin changed this file' });
  await expect(note).toContainText('An admin changed this file after accepting it');
  await expect(note).toContainText(CHANGED_FILE_NAME);
  await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
  expect(api.memberAssetCalls).not.toContain(`/api/member/files/${CHANGED_FILE_ID}`);
  expect(api.adminCalls).toEqual([]);
});
