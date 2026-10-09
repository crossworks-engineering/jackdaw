import { expect, test } from '@playwright/test';
import {
  CLIENT_ITEM_ID,
  CLIENT_ITEM_TITLE,
  CLIENT_NOTE_ID,
  CLIENT_NOTE_TITLE,
  NEW_CLIENT_ITEM_ID,
  NEW_CLIENT_ITEM_TITLE,
  OLD_FOLDER_SHARE_ID,
  OLD_FOLDER_TITLE,
  OLD_NOTE_SHARE_ID,
  signInAsAdmin,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The client logins C0/C1 audit fixes in the browser, against the in-memory
 * API (no brain): the admin shell's failed role probe retries on its own
 * (A13), "What clients see" after a check with items new since it (A7, A11,
 * A25), and the Access popover on a client item with old client links (A11,
 * A30). What clients see is a step in Settings > Logins > Clients since
 * 2026-10-09 (it was a Team admin tab).
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

/** Settings > Logins with What clients see selected. */
const WHAT_CLIENTS_SEE = '/settings/users?selected=what-clients-see';

test.beforeEach(async ({ baseURL, context }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
  await signInAsAdmin(context, baseURL!);
});

test.describe('the shell when /api/shell fails', () => {
  test('shows the failure card, then recovers on its own with no click', async ({ page }) => {
    // The query's own attempt and its one retry fail; the card's first
    // automatic retry (about 2 s later) gets the answer.
    api.admin.shellFailures = 2;
    await page.goto(WHAT_CLIENTS_SEE);
    const card = page.locator('section[role="alert"]');
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText('Could not load your workspace');
    await expect(card).toContainText('Something went wrong while loading it.');
    await expect(card).not.toContainText('did not answer');
    await expect(card).toContainText('Reconnecting');
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(card).toBeFocused();
    // No owner chrome while the role is unknown.
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toHaveCount(0);

    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 20_000,
    });
    await expect(card).toHaveCount(0);
    expect(api.admin.shellCalls).toBeGreaterThanOrEqual(3);
  });

  test('Try again asks at once', async ({ page }) => {
    api.admin.shellFailures = 1000;
    await page.goto(WHAT_CLIENTS_SEE);
    const card = page.locator('section[role="alert"]');
    await expect(card).toBeVisible({ timeout: 60_000 });
    api.admin.shellFailures = 0;
    await card.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('What clients see, after a check', () => {
  test('marks only what went to client since, names the old link above it, and re-checks', async ({
    page,
  }) => {
    api.admin.clientAcks.push([CLIENT_ITEM_ID]);
    api.admin.clientItems = [CLIENT_ITEM_ID, NEW_CLIENT_ITEM_ID];
    await page.goto(WHAT_CLIENTS_SEE);
    await expect(page.getByRole('link', { name: NEW_CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('client-report-ack')).toHaveText(
      /Ada Admin checked this list on .+ \(1 item\)\./,
    );
    await expect(
      page.getByText('1 item went to client since then. Check the list again.'),
    ).toBeVisible();
    // Exactly one row is new, and it is the new item's.
    await expect(page.getByText('New since checked')).toHaveCount(1);
    const newRow = page.getByRole('listitem').filter({ hasText: NEW_CLIENT_ITEM_TITLE });
    await expect(newRow.getByText('New since checked')).toBeVisible();
    // The old folder link above it, with the way to it in Shared links.
    await expect(
      newRow.getByText(`Reachable through the old link on the folder ${OLD_FOLDER_TITLE}`),
    ).toBeVisible();
    await expect(newRow.getByRole('link', { name: 'Open in Shared links' })).toHaveAttribute(
      'href',
      `/team-admin?view=shares&share=${OLD_FOLDER_SHARE_ID}`,
    );

    await page.getByRole('button', { name: 'I have checked this list' }).click();
    await expect(page.getByText('New since checked')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'I have checked this list' })).toHaveCount(0);
    expect(api.admin.clientAcks.at(-1)).toEqual([CLIENT_ITEM_ID, NEW_CLIENT_ITEM_ID]);
  });

  test('a list that changed under the check is reloaded, and the admin is told', async ({
    page,
  }) => {
    api.admin.reportChangedOnce = true;
    await page.goto(WHAT_CLIENTS_SEE);
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'I have checked this list' }).click();
    await expect(page.getByText(/The list changed while you were checking it/)).toBeVisible({
      timeout: 15_000,
    });
    // Nothing was recorded; the button is still there to check again.
    expect(api.admin.clientAcks).toEqual([]);
    await page.getByRole('button', { name: 'I have checked this list' }).click();
    await expect(page.getByTestId('client-report-ack')).toHaveText(/checked this list on/, {
      timeout: 15_000,
    });
    expect(api.admin.clientAcks).toEqual([[CLIENT_ITEM_ID]]);
  });
});

test.describe('the Access popover on a client item with old links', () => {
  test('names both old links, and revokes the item own one, which stays at Client', async ({
    page,
  }) => {
    await page.goto(`/notes?selected=${CLIENT_NOTE_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_NOTE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Access' }).first().click();
    const pop = page.getByRole('dialog');
    await expect(pop.getByText('Old client link: clients will sign in instead')).toBeVisible({
      timeout: 15_000,
    });
    // Client, with its old link still open: the line never says No link.
    await expect(pop.getByText(/^Signed-in clients \(and the team\)/)).toBeVisible();
    await expect(pop.getByText(/No link/)).toHaveCount(0);
    // No Copy for an old client link.
    await expect(pop.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
    // The folder above it.
    await expect(
      pop.getByText(`Reachable through the old link on the folder ${OLD_FOLDER_TITLE}`),
    ).toBeVisible();
    await expect(pop.getByRole('link', { name: 'Shared links' })).toHaveAttribute(
      'href',
      `/team-admin?view=shares&share=${OLD_FOLDER_SHARE_ID}`,
    );

    await pop.getByRole('button', { name: 'Revoke link (stays at Client)' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('It stays at Client, for signed-in clients.');
    await confirm.getByRole('button', { name: 'Revoke link' }).click();
    await expect(confirm).toHaveCount(0, { timeout: 15_000 });
    expect(api.admin.revokes).toEqual([OLD_NOTE_SHARE_ID]);

    // Opened again: the own link is gone, the level is still Client.
    await page.getByRole('button', { name: 'Access' }).first().click();
    await expect(page.getByRole('dialog').getByText(/No link/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog').getByText('Old client link')).toHaveCount(0);
  });
});
