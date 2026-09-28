import { expect, test } from '@playwright/test';
import {
  ADMIN_OWN_ID,
  ADMIN_OWN_TITLE,
  MEMBER_NAME,
  RELEASED_ID,
  RELEASED_TITLE,
  SUBMITTED_ID,
  SUBMITTED_IMAGE_TITLE,
  SUBMITTED_TITLE,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * Take over (audit F07), the admin's side: from Team admin > Review an admin
 * takes a member's submitted item into their own private items, then works
 * on it there and gives it back or accepts it into the brain. Runs against
 * the in-memory API in its admin role (mock-member-api.ts), no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
  await signInAsAdmin(context, baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

const reviewItem = (id: string) => `/team-admin?view=review&item=${id}`;

test('Take over asks first, names what moves, and opens it in the Private view', async ({
  page,
}) => {
  await page.goto(reviewItem(SUBMITTED_ID));
  await expect(page.getByRole('heading', { name: SUBMITTED_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Take over' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Take this over?' })).toBeVisible();
  await expect(dialog).toContainText(
    `moves into your private items, out of ${MEMBER_NAME}’s reach, until you accept it into the brain or give it back.`,
  );
  // The bundle preview: what moves with it.
  await expect(dialog).toContainText('Also moves 1 file.');
  await expect(dialog).toContainText(SUBMITTED_IMAGE_TITLE);
  // Nothing moved yet.
  expect(api.admin.takeOvers).toEqual([]);

  await dialog.getByRole('button', { name: 'Take over' }).click();
  await expect(page).toHaveURL(new RegExp(`/pages\\?space=private&id=${SUBMITTED_ID}$`), {
    timeout: 30_000,
  });
  expect(api.admin.takeOvers).toEqual([SUBMITTED_ID]);

  // The Private view: it lists "From <member>" beside the admin's own item,
  // and the open item says who it is from.
  const taken = page.getByRole('listitem').filter({ hasText: SUBMITTED_TITLE });
  await expect(taken).toContainText(`From ${MEMBER_NAME}`, { timeout: 30_000 });
  await expect(page.getByRole('listitem').filter({ hasText: ADMIN_OWN_TITLE })).not.toContainText(
    'From ',
  );
  await expect(page.getByText(`From ${MEMBER_NAME}`, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Give back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept into brain' })).toBeVisible();
  // The member can still take it back: no Delete (the brain would refuse).
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('a refused Take over says why and stays on the queue', async ({ page }) => {
  api.admin.takeOverAnswer = { status: 404, body: { error: 'Not found.' } };
  await page.goto(reviewItem(SUBMITTED_ID));
  await page.getByRole('button', { name: 'Take over' }).click({ timeout: 60_000 });
  await page.getByRole('alertdialog').getByRole('button', { name: 'Take over' }).click();
  await expect(page.getByText(/not waiting for review any more/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/team-admin\?view=review/);

  api.admin.takeOverAnswer = {
    status: 409,
    body: { error: 'too many', reason: 'too-large' },
  };
  await page.getByRole('button', { name: 'Take over' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Take over' }).click();
  await expect(page.getByText(/too many others to take over at once/)).toBeVisible({
    timeout: 15_000,
  });
});

test('a released item says so, can be taken over again, and takes no comments', async ({
  page,
}) => {
  await page.goto(reviewItem(RELEASED_ID));
  await expect(page.getByRole('heading', { name: RELEASED_TITLE })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/Released: the admin who took this over/)).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: RELEASED_TITLE }).first(),
  ).toContainText('released');
  await expect(page.getByRole('button', { name: 'Take over' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Reply to the author' })).toHaveCount(0);
});

test('Give back needs a note, sends it, and the item leaves the Private view', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID, ADMIN_OWN_ID];
  await page.goto(`/pages?space=private&id=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Give back' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: `Give back to ${MEMBER_NAME}` })).toBeVisible();
  const send = dialog.getByRole('button', { name: 'Give back with note' });
  await expect(send).toBeDisabled();
  await dialog.getByLabel('What needs to change').fill('Add the load test.');
  await send.click();

  await expect(page.getByText(`Gave “${SUBMITTED_TITLE}” back to ${MEMBER_NAME}.`)).toBeVisible({
    timeout: 15_000,
  });
  expect(api.admin.giveBacks).toEqual([{ id: SUBMITTED_ID, note: 'Add the load test.' }]);
  await expect(page.getByRole('listitem').filter({ hasText: SUBMITTED_TITLE })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: ADMIN_OWN_TITLE })).toBeVisible();
});

test('a refused Give back stays in the dialog and names the items to remove', async ({ page }) => {
  api.admin.queue = [];
  api.admin.privateIds = [SUBMITTED_ID, ADMIN_OWN_ID];
  api.admin.giveBackAnswer = {
    status: 409,
    body: { error: 'uses things', reason: 'embed', ids: [ADMIN_OWN_ID] },
  };
  await page.goto(`/pages?space=private&id=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Give back' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('What needs to change').fill('Tidy it.');
  await dialog.getByRole('button', { name: 'Give back with note' }).click();

  const notice = dialog.getByRole('status');
  await expect(notice).toContainText('Remove these, save a version, then give it back:', {
    timeout: 15_000,
  });
  const link = notice.getByRole('link', { name: ADMIN_OWN_TITLE });
  await expect(link).toHaveAttribute('href', `/pages?space=private&id=${ADMIN_OWN_ID}`);
  // Still open, the note kept, nothing moved.
  await expect(dialog.getByLabel('What needs to change')).toHaveValue('Tidy it.');
  expect(api.admin.privateIds).toContain(SUBMITTED_ID);

  api.admin.giveBackAnswer = {
    status: 409,
    body: { error: 'gone', reason: 'author-inactive' },
  };
  await dialog.getByRole('button', { name: 'Give back with note' }).click();
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
  await page.goto(`/pages?space=private&id=${SUBMITTED_ID}`);
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
  await page.goto(`/pages?space=private&id=${SUBMITTED_ID}`);
  await page.getByRole('button', { name: 'Accept into brain' }).click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`by ${MEMBER_NAME}`);
  await expect(dialog).toContainText(`${MEMBER_NAME} sees it under Accepted.`);
  await dialog.getByRole('button', { name: 'Accept into the brain' }).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${SUBMITTED_ID}$`), { timeout: 15_000 });
  expect(api.admin.accepts.map((a) => a.id)).toEqual([SUBMITTED_ID]);
});
