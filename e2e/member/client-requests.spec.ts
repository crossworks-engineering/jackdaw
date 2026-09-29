import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_ACCEPTED_TITLE,
  CLIENT_DRAFT_TITLE,
  CLIENT_EMBED_TITLE,
  CLIENT_NAME,
  CLIENT_QUOTA_MESSAGE,
  CLIENT_REQUEST_TEXT,
  CLIENT_REQUEST_TITLE,
  CLIENT_RETURNED_ID,
  CLIENT_RETURNED_NOTE,
  CLIENT_RETURNED_TITLE,
  CLIENT_SITE,
  CLIENT_SUBMISSION_ID,
  CLIENT_SUBMISSION_TITLE,
  CLIENT_SUBMITTED_ID,
  CLIENT_SUBMITTED_TITLE,
  LIBRARY_CLIENT_TITLE,
  LIBRARY_TITLE,
  REVIEWER_COMMENT,
  SHARED_PAGE_ID,
  SHARED_PAGE_TITLE,
  SHARED_TEAM_COMMENT,
  STAFF_NAME,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * A client's own items (client logins C5), against the in-memory API (no
 * brain): My requests beside "Shared with you" (create, save, submit,
 * recall, the returned note, the review talk, uploads and the client cap,
 * the filters, an accepted item, an older brain), the thread on an item
 * shared with clients, and the other sides: a member reads a client's
 * request and comments on a client-level Library item, and an admin sees a
 * client's item in Review wearing the Client badge.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

async function signInAsClient(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_client', value: '1', url: baseURL },
  ]);
}

const requests = (page: Page) => page.getByRole('list', { name: 'My requests' });
const card = (page: Page, title: string) =>
  requests(page).locator('[data-item-id]').filter({ hasText: title });
const toast = (page: Page, text: string | RegExp) =>
  page.locator('[role="status"], [role="alert"]').filter({ hasText: text }).first();

test.describe('My requests', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('sits beside Shared with you; each row wears its state as a pill', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link')).toHaveText(['Shared with you', 'My requests'], {
      timeout: 60_000,
    });
    await nav.getByRole('link', { name: 'My requests' }).click();
    await expect(page).toHaveURL(/\/\?view=requests$/);
    await expect(nav.getByRole('link', { name: 'My requests' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 30_000 });
    await expect(card(page, CLIENT_DRAFT_TITLE).locator('[data-state]')).toHaveText('private');
    await expect(card(page, CLIENT_SUBMITTED_TITLE).locator('[data-state]')).toHaveText(
      'submitted',
    );
    await expect(card(page, CLIENT_RETURNED_TITLE).locator('[data-state]')).toHaveText('returned');
    // An accepted row wears no pill; it says when it was accepted.
    await expect(card(page, CLIENT_ACCEPTED_TITLE).locator('[data-state]')).toHaveCount(0);
    await expect(card(page, CLIENT_ACCEPTED_TITLE)).toContainText('accepted');
    expect(api.clientCalls).toEqual([]);
  });

  test('a client creates a page, saves a version, submits, sees Submitted, and recalls', async ({
    page,
  }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('menuitem', { name: /Page/ }).click();

    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeVisible({ timeout: 30_000 });
    await title.fill('Handover checklist');
    await title.press('Enter');
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type('Keys, manuals, warranties.');
    // No sharing for a client: no Private / Team switch.
    await expect(page.getByRole('group', { name: 'Who can see this' })).toHaveCount(0);

    const save = page.getByRole('button', { name: 'Save version' });
    await expect(save).toBeEnabled({ timeout: 15_000 });
    await save.click();
    await expect(toast(page, 'Version saved.')).toBeVisible();
    expect(JSON.stringify(api.clientOwn.saves.at(-1)?.doc)).toContain('Keys, manuals');

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(toast(page, 'Submitted for review.')).toBeVisible();
    await expect(page.getByText('Submitted for review: nobody can change it now.')).toBeVisible();
    await expect(card(page, 'Handover checklist').locator('[data-state]')).toHaveText('submitted', {
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Recall' }).click();
    await expect(toast(page, 'Recalled. You can edit it again.')).toBeVisible();
    await expect(card(page, 'Handover checklist').locator('[data-state]')).toHaveText('private', {
      timeout: 15_000,
    });
    const id = api.clientOwn.items.find((i) => i.row.title === 'Handover checklist')?.row.id;
    expect(id).toBeTruthy();
    expect(api.clientOwn.submits).toEqual([id]);
    expect(api.clientOwn.recalls).toEqual([id]);
    expect(api.clientCalls).toEqual([]);
  });

  test('a returned item shows the reviewer’s note, and can go again', async ({ page }) => {
    await page.goto(`/?view=requests&id=${CLIENT_RETURNED_ID}`);
    await expect(page.getByText('Returned by the reviewer')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(CLIENT_RETURNED_NOTE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resubmit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('the review talk on a submitted item: the brand’s words, and my own to delete', async ({
    page,
  }) => {
    await page.goto(`/?view=requests&id=${CLIENT_SUBMITTED_ID}`);
    const talk = page.getByRole('region', { name: 'Comments' });
    await expect(talk).toContainText(REVIEWER_COMMENT, { timeout: 60_000 });
    // A reviewer is the brand, never a staff name.
    await expect(talk).toContainText(CLIENT_SITE);
    await expect(talk.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);

    await talk.getByRole('textbox', { name: 'Add a comment' }).fill('Friday works too.');
    await talk.getByRole('button', { name: 'Comment' }).click();
    await expect(talk).toContainText('Friday works too.');
    await expect(talk).toContainText(CLIENT_NAME);
    await expect(talk.getByRole('button', { name: 'Delete comment' })).toHaveCount(1);
    await talk.getByRole('button', { name: 'Delete comment' }).click();
    await expect(talk).not.toContainText('Friday works too.');
    expect(api.clientOwn.comments[CLIENT_SUBMITTED_ID]?.map((c) => c.body)).toEqual([
      REVIEWER_COMMENT,
    ]);
    expect(api.clientCalls).toEqual([]);
  });

  test('an upload over 20 MB is refused before a byte is sent; a cap the brain reports is in its words', async ({
    page,
  }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({
      name: 'site-scan.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(21 * 1024 * 1024),
    });
    await expect(toast(page, 'This file is 21 MB, over the 20 MB upload limit.')).toBeVisible();
    expect(api.clientOwn.uploads).toEqual([]);

    api.clientOwn.uploadRefusal = {
      status: 409,
      body: { error: CLIENT_QUOTA_MESSAGE, reason: 'quota' },
    };
    await input.setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(68),
    });
    await expect(toast(page, CLIENT_QUOTA_MESSAGE)).toBeVisible();
    expect(api.clientOwn.uploads).toEqual([]);

    await input.setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(68),
    });
    await expect(toast(page, 'Uploaded.')).toBeVisible();
    expect(api.clientOwn.uploads).toEqual(['photo.png']);
    // It opens, its bytes from the client's own route.
    await expect
      .poll(
        () => api.clientRouteCalls.some((c) => /^GET \/api\/client\/space\/[^/]+\/bytes$/.test(c)),
        {
          timeout: 15_000,
        },
      )
      .toBe(true);
    await expect(card(page, 'photo.png').locator('[data-state]')).toHaveText('private', {
      timeout: 15_000,
    });
    expect(api.clientCalls).toEqual([]);
  });

  test('filters by state and by kind, in the URL', async ({ page }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });

    await page.getByRole('button', { name: 'All items', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Returned' }).click();
    await expect(page).toHaveURL(/[?&]state=returned/);
    await expect(page).toHaveURL(/[?&]view=requests/);
    await expect(requests(page).getByRole('listitem')).toHaveCount(1);
    await expect(requests(page)).toContainText(CLIENT_RETURNED_TITLE);
    expect(api.clientOwn.itemsStates).toContain('returned');

    await page.getByRole('button', { name: 'Returned', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Accepted' }).click();
    await expect(requests(page).getByRole('listitem')).toHaveCount(1);
    await expect(requests(page)).toContainText(CLIENT_ACCEPTED_TITLE);

    await page.getByRole('button', { name: 'Accepted', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'All items' }).click();
    await page.getByRole('button', { name: 'Everything', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Notes' }).click();
    await expect(page).toHaveURL(/[?&]kind=note/);
    await expect(requests(page).getByRole('listitem')).toHaveCount(2);

    await page.getByRole('textbox', { name: 'Search by title' }).fill('parking');
    await expect(requests(page).getByRole('listitem')).toHaveCount(1);
    await expect(requests(page)).toContainText(CLIENT_SUBMITTED_TITLE);
    await expect(page).toHaveURL(/[?&]q=parking/);
  });

  test('an accepted row opens read only', async ({ page }) => {
    await page.goto('/?view=requests');
    await card(page, CLIENT_ACCEPTED_TITLE).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/[?&]src=accepted/);
    await expect(page.getByText('The site is open 7 to 5 on weekdays.')).toBeVisible();
    await expect(page.getByText(/You wrote this, and it was accepted/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  });

  test('on a brain before C5: a quiet line, nothing to make, no thread', async ({ page }) => {
    api.clientOwn.routes = false;
    await page.goto('/?view=requests');
    await expect(page.getByText('My requests is not available here yet.').first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: 'New' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload' })).toHaveCount(0);
    await expect(page.getByText('Could not load')).toHaveCount(0);

    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    await expect(page.locator('.ProseMirror')).toContainText('The brief.', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^Comments/ })).toHaveCount(0);
    await expect(page.getByText('Could not load')).toHaveCount(0);
    // Asked once, not polled.
    const asks = () =>
      api.clientRouteCalls.filter((c) => c === `GET /api/client/shared/${SHARED_PAGE_ID}/comments`)
        .length;
    expect(asks()).toBe(1);
  });
});

test.describe('the thread on a shared item', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('a client reads the team’s comment by name, posts, and deletes only its own', async ({
    page,
  }) => {
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    await expect(page.getByRole('heading', { name: SHARED_PAGE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    const thread = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /^Comments/ }) });
    await expect(thread).toContainText(SHARED_TEAM_COMMENT, { timeout: 30_000 });
    await expect(thread).toContainText(STAFF_NAME);
    await expect(thread).toContainText('Team');
    await expect(thread.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);

    await thread.getByRole('textbox').fill('Thanks, looks right.');
    await thread.getByRole('button', { name: 'Add comment' }).click();
    await expect(thread).toContainText('Thanks, looks right.');
    await expect(thread.getByRole('button', { name: 'Delete comment' })).toHaveCount(1);
    await thread.getByRole('button', { name: 'Delete comment' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(thread).not.toContainText('Thanks, looks right.');
    expect(api.clientOwn.shared[SHARED_PAGE_ID]?.map((c) => c.body)).toEqual([SHARED_TEAM_COMMENT]);
    expect(api.clientCalls).toEqual([]);
  });
});

test.describe('the member side', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin);
    await signInAsMember(context, baseURL!);
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('mantle_tour:member', 'done');
      } catch {
        // A browser that blocks storage just sees the tour.
      }
    });
  });

  test('a member sees a client request in the one list and opens it read only', async ({
    page,
  }) => {
    api.clientRequests = true;
    await page.goto('/notes');
    const row = page.locator('[data-item-id]').filter({ hasText: CLIENT_REQUEST_TITLE });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(row.getByText('Client', { exact: true })).toBeVisible();
    await expect(row.locator('[data-state]')).toHaveText('submitted');

    await page.getByRole('button', { name: 'All items', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Client requests' }).click();
    await expect(page).toHaveURL(/[?&]state=client-requests/);
    await expect(page.locator('[data-item-id]')).toHaveCount(1);
    expect(api.itemsStates).toContain('client-requests');

    await row.click();
    await expect(page).toHaveURL(/[?&]src=client-request/);
    await expect(page.getByText(CLIENT_REQUEST_TEXT)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`Written by ${CLIENT_NAME}.`, { exact: false })).toBeVisible();
    // Read only: no title to edit, no review actions, no thread.
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Comments' })).toHaveCount(0);
    expect(api.adminCalls).toEqual([]);
  });

  test('a member comments on a client-level Library item; a team item has no thread', async ({
    page,
  }) => {
    api.libraryList = true;
    await page.goto('/pages');
    await page
      .locator('[data-item-id]')
      .filter({ hasText: LIBRARY_CLIENT_TITLE })
      .click({ timeout: 60_000 });
    await expect(page.getByText('For the client.')).toBeVisible({ timeout: 30_000 });
    const thread = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /^Comments/ }) });
    await thread.getByRole('textbox').fill('Sent to the client on Monday.');
    await thread.getByRole('button', { name: 'Add comment' }).click();
    await expect(thread).toContainText('Sent to the client on Monday.');
    expect(api.libraryComments.map((c) => c.body)).toEqual(['Sent to the client on Monday.']);

    await page.locator('[data-item-id]').filter({ hasText: LIBRARY_TITLE }).click();
    await expect(page.getByText('Read me.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^Comments/ })).toHaveCount(0);
    expect(api.adminCalls).toEqual([]);
  });
});

test.describe('the admin side', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  test('a client’s item in Review wears the Client badge; Accept starts at Team, the tick before Client', async ({
    page,
  }) => {
    api.admin.queue = [CLIENT_SUBMISSION_ID];
    await page.goto(`/team-admin?view=review&item=${CLIENT_SUBMISSION_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_SUBMISSION_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    const queue = page.getByRole('region', { name: 'Waiting for review' });
    await expect(queue.getByText('Client', { exact: true })).toBeVisible();
    await expect(page.getByText(`Page by ${CLIENT_NAME}`)).toContainText('Client');

    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('A client wrote this. It starts at Team.');
    await expect(dialog.getByRole('radio', { name: 'Team' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const accept = dialog.getByRole('button', { name: 'Accept into the brain' });
    await expect(accept).toBeEnabled({ timeout: 15_000 });

    await dialog.getByRole('radio', { name: 'Client' }).click();
    const goingDown = dialog.getByRole('group', { name: 'What goes down with it' });
    await expect(goingDown).toContainText(CLIENT_EMBED_TITLE);
    await expect(accept).toBeDisabled();
    await goingDown.getByRole('checkbox').check();
    await expect(accept).toBeEnabled();
  });
});
