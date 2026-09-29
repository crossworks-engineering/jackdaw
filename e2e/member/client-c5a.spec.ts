import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_ACCEPTED_FILE_ID,
  CLIENT_ACCEPTED_FILE_NAME,
  CLIENT_DRAFT_ID,
  CLIENT_DRAFT_TITLE,
  CLIENT_EMAIL,
  CLIENT_HELD_ID,
  CLIENT_HELD_TITLE,
  CLIENT_LOGIN_ID,
  CLIENT_NAME,
  CLIENT_NOTE_ID,
  CLIENT_NOTE_TITLE,
  CLIENT_REQUEST_ID,
  CLIENT_REQUEST_TEXT,
  CLIENT_RETURNED_ID,
  CLIENT_SUBMITTED_ID,
  CLIENT_SUBMITTED_TITLE,
  LIBRARY_CLIENT_ID,
  OWNER_THREAD_CLIENT_COMMENT,
  SHARED_PAGE_ID,
  SHARED_PAGE_TITLE,
  SHARED_TEAM_COMMENT,
  STAFF_NAME,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockComment,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The client logins C5 audit fixes, against the in-memory API (no brain):
 * a client's screens name no staff role (U3), an older brain is asked once
 * (U4, with the clock moved on and a focus), a comment loads no image (U5),
 * a member's client request names its writer (U6), a crafted id stays one
 * path segment (U8), Back after a search restores the list (U9), the
 * thread's delete shows on touch and its composer has a name (U10), paged
 * threads with Load older, the brain's sentence for a comment cap, and the
 * missing behaviour tests (U12). The admin side: the client thread on the
 * owner's own item view (U2), and Team admin > Clients' client comments and
 * storage cards, each left out on an older brain.
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
const threadOf = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: /^Comments/ }) });

/** A focus back on the tab, as TanStack Query hears it. */
const refocus = (page: Page) =>
  page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });

/** Everything a person reads on the page: the words, and every hover and
 *  accessible name. (A `data-*` hook is the code's, never shown.) */
const readable = (page: Page) =>
  page.evaluate(() => {
    const words = document.body.innerText;
    const attrs = [...document.querySelectorAll('[title], [aria-label], [placeholder]')].flatMap(
      (el) => ['title', 'aria-label', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
    );
    return [words, ...attrs].join('\n');
  });

const comment = (id: string, body: string, createdAt: string, over: Partial<MockComment> = {}) =>
  ({
    id,
    nodeId: SHARED_PAGE_ID,
    authorKind: 'member',
    authorName: STAFF_NAME,
    mine: false,
    body,
    createdAt,
    editedAt: null,
    ...over,
  }) satisfies MockComment;

test.describe('a client’s screens', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('name no staff role: the pills, the State filter, the held item, a changed accepted file (U3)', async ({
    page,
  }) => {
    api.clientOwn.held = true;
    api.clientOwn.acceptedFile = true;
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(6, { timeout: 60_000 });
    await expect(card(page, CLIENT_HELD_TITLE).locator('[data-state]')).toHaveText('with the team');
    expect(await readable(page)).not.toMatch(/admin/i);

    // The State filter's menu, open.
    await page.getByRole('button', { name: 'All items', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: 'With the team' })).toBeVisible();
    expect(await readable(page)).not.toMatch(/admin/i);
    await page.keyboard.press('Escape');

    // Every item a client can open.
    for (const title of [CLIENT_HELD_TITLE, CLIENT_ACCEPTED_FILE_NAME, CLIENT_SUBMITTED_TITLE]) {
      await card(page, title).click();
      await expect(page).toHaveURL(/[?&]id=/);
      await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 15_000 });
      expect(await readable(page), title).not.toMatch(/admin/i);
    }
    await page.goto(`/?view=requests&id=${CLIENT_RETURNED_ID}`);
    await expect(page.getByText('Returned by the reviewer')).toBeVisible({ timeout: 30_000 });
    expect(await readable(page)).not.toMatch(/admin/i);
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Shared items' })).toBeVisible({
      timeout: 30_000,
    });
    expect(await readable(page)).not.toMatch(/admin/i);
    expect(api.clientCalls).toEqual([]);
  });

  test('an item a reviewer holds: the list says so, and nothing of it is asked (U12)', async ({
    page,
  }) => {
    api.clientOwn.held = true;
    await page.goto('/?view=requests');
    await card(page, CLIENT_HELD_TITLE).click({ timeout: 60_000 });
    await expect(page.getByText('With the team', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The reviewer is working on this. You will see it again when it is accepted'),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveCount(0);
    expect(api.clientRouteCalls.filter((c) => c.includes(CLIENT_HELD_ID))).toEqual([]);

    // From a link (no row to say so), the brain's 409 says it.
    await page.goto(`/?view=requests&state=private&id=${CLIENT_HELD_ID}`);
    await expect(page.getByText('The reviewer is working on this.')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('an accepted file the team changed since: said, and no download asked (U12)', async ({
    page,
  }) => {
    api.clientOwn.acceptedFile = true;
    await page.goto(`/?view=requests&src=accepted&id=${CLIENT_ACCEPTED_FILE_ID}`);
    await expect(
      page.getByText('The reviewer changed this file after accepting it', { exact: false }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(CLIENT_ACCEPTED_FILE_NAME).first()).toBeVisible();
    expect(api.clientRouteCalls.filter((c) => c.startsWith('GET /api/client/files/'))).toEqual([]);
  });

  test('a client creates a note and its words reach the brain (U12)', async ({ page }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });
    await page.getByRole('button', { name: 'New' }).click();
    await page.getByRole('menuitem', { name: /Note/ }).click();
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    await expect(title).toBeVisible({ timeout: 30_000 });
    await title.fill('Parking for the crane');
    await title.press('Enter');
    await page.getByRole('textbox', { name: 'Note text' }).fill('Two bays on Friday.');
    const saved = () => {
      const body = api.clientOwn.items.find((i) => i.row.title === 'Parking for the crane')?.body;
      return body?.type === 'note' ? body.note.content : null;
    };
    await expect.poll(saved, { timeout: 15_000 }).toBe('Two bays on Friday.');
    await expect(card(page, 'Parking for the crane').locator('[data-state]')).toHaveText(
      'private',
      { timeout: 15_000 },
    );
    expect(api.clientCalls).toEqual([]);
  });

  test('a client deletes its own item, after a confirm (U12)', async ({ page }) => {
    await page.goto(`/?view=requests&id=${CLIENT_DRAFT_ID}`);
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
      CLIENT_DRAFT_TITLE,
      { timeout: 60_000 },
    );
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`Delete “${CLIENT_DRAFT_TITLE}”?`);
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => api.clientOwn.deletes).toEqual([CLIENT_DRAFT_ID]);
    await expect(card(page, CLIENT_DRAFT_TITLE)).toHaveCount(0, { timeout: 15_000 });
    expect(api.clientCalls).toEqual([]);
  });

  test('a crafted id stays one path segment: nothing else is asked, nothing breaks (U8)', async ({
    page,
  }) => {
    await page.goto('/?view=requests&id=..%2Fchat');
    await expect(page.getByText('This item is gone.')).toBeVisible({ timeout: 60_000 });
    expect(api.clientRouteCalls).toContain('GET /api/client/space/..%2Fchat');
    expect(api.clientRouteCalls.filter((c) => c.startsWith('GET /api/client/chat'))).toEqual([]);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
  });

  test('Back after a search restores the list, and stays (U9)', async ({ page }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });
    const box = page.getByRole('textbox', { name: 'Search by title' });
    await box.fill('parking');
    await expect(page).toHaveURL(/[?&]q=parking/);
    await expect(requests(page).getByRole('listitem')).toHaveCount(1);

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(box).toHaveValue('');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4);
    // Nothing pushes the old words back a moment later.
    await page.waitForTimeout(1_000);
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(requests(page).getByRole('listitem')).toHaveCount(4);

    await page.goForward();
    await expect(page).toHaveURL(/[?&]q=parking/);
    await expect(box).toHaveValue('parking');
  });

  test('pages My requests: the next page is asked with page=2 (U7)', async ({ page }) => {
    api.clientOwn.itemsPageSize = 2;
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(2, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(requests(page).getByRole('listitem')).toHaveCount(2);
    expect(api.clientOwn.itemsPages).toContain(2);
  });

  test('the thread pages: the newest first, Load older asks the page before (paged threads)', async ({
    page,
  }) => {
    api.threadPageSize = 2;
    api.clientOwn.shared[SHARED_PAGE_ID] = [
      comment('c-old', 'The oldest word.', '2026-09-01T08:00:00.000Z'),
      comment('c-mid', 'A middle word.', '2026-09-02T08:00:00.000Z'),
      comment('c-new', SHARED_TEAM_COMMENT, '2026-09-03T08:00:00.000Z'),
    ];
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    const thread = threadOf(page);
    await expect(thread).toContainText(SHARED_TEAM_COMMENT, { timeout: 60_000 });
    await expect(thread).toContainText('A middle word.');
    await expect(thread).not.toContainText('The oldest word.');
    await expect(thread.getByRole('heading')).toHaveText('Comments(2+)');
    await thread.getByRole('button', { name: 'Load older' }).click();
    await expect(thread).toContainText('The oldest word.');
    await expect(thread.getByRole('button', { name: 'Load older' })).toHaveCount(0);
    expect(
      api.clientRouteCalls.some((c) =>
        c.startsWith(`GET /api/client/shared/${SHARED_PAGE_ID}/comments`),
      ),
    ).toBe(true);
  });

  test('a comment over the day’s cap: the brain’s sentence, and the words kept', async ({
    page,
  }) => {
    const sentence = 'You have written 100 comments today. You can write again tomorrow.';
    api.clientOwn.commentRefusal = {
      status: 429,
      body: { reason: 'comment-cap', error: sentence },
    };
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    const thread = threadOf(page);
    await expect(thread).toContainText(SHARED_TEAM_COMMENT, { timeout: 60_000 });
    const box = thread.getByRole('textbox', { name: 'Write a comment' });
    await box.fill('One more thing.');
    await thread.getByRole('button', { name: 'Add comment' }).click();
    await expect(toast(page, sentence)).toBeVisible();
    await expect(box).toHaveValue('One more thing.');
  });

  test('a comment loads no image from anywhere (U5)', async ({ page }) => {
    const fetched: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('pixel.png')) fetched.push(r.url());
    });
    api.clientOwn.shared[SHARED_PAGE_ID] = [
      comment(
        'c-px',
        'Seen ![tracker](http://127.0.0.1:3912/pixel.png?who=you)',
        '2026-09-01T08:00:00.000Z',
      ),
    ];
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    const thread = threadOf(page);
    await expect(thread).toContainText('[tracker]', { timeout: 60_000 });
    await expect(thread.locator('img')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(fetched).toEqual([]);
  });

  test('the open thread is asked again every 30 seconds (U12)', async ({ page }) => {
    await page.clock.install();
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    const thread = threadOf(page);
    await expect(thread).toContainText(SHARED_TEAM_COMMENT, { timeout: 60_000 });
    const asks = () =>
      api.clientRouteCalls.filter((c) =>
        c.startsWith(`GET /api/client/shared/${SHARED_PAGE_ID}/comments`),
      ).length;
    const before = asks();
    api.clientOwn.shared[SHARED_PAGE_ID]!.push(
      comment('c-later', 'Posted from another browser.', new Date().toISOString()),
    );
    await page.clock.runFor(31_000);
    await expect(thread).toContainText('Posted from another browser.', { timeout: 15_000 });
    expect(asks()).toBeGreaterThan(before);
  });

  test('on a brain before C5: each route asked once, after a poll’s time and a focus (U4)', async ({
    page,
  }) => {
    api.clientOwn.routes = false;
    await page.clock.install();
    await page.goto('/?view=requests');
    await expect(page.getByText('My requests is not available here yet.').first()).toBeVisible({
      timeout: 60_000,
    });
    const listAsks = () =>
      api.clientRouteCalls.filter((c) => c.startsWith('GET /api/client/items')).length;
    expect(listAsks()).toBe(1);
    // Past one shell poll (60 s), then back on the tab.
    await page.clock.runFor(65_000);
    await refocus(page);
    await page.clock.runFor(2_000);
    await page.waitForTimeout(500);
    expect(listAsks()).toBe(1);
    expect(
      api.clientRouteCalls.filter((c) => c === 'GET /api/client/shell').length,
    ).toBeGreaterThan(1);

    // The thread on a shared item: asked once, not polled, not on focus.
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    await expect(page.locator('.ProseMirror')).toContainText('The brief.', { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^Comments/ })).toHaveCount(0);
    const threadAsks = () =>
      api.clientRouteCalls.filter((c) => c === `GET /api/client/shared/${SHARED_PAGE_ID}/comments`)
        .length;
    await expect.poll(threadAsks).toBe(1);
    await page.clock.runFor(65_000);
    await refocus(page);
    await page.clock.runFor(2_000);
    await page.waitForTimeout(500);
    expect(threadAsks()).toBe(1);
    await expect(page.getByText('Could not load')).toHaveCount(0);
  });
});

test.describe('a client on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('My requests fits 375 px: no sideways scroll, the list then the item (U12)', async ({
    page,
  }) => {
    await page.goto('/?view=requests');
    await expect(requests(page).getByRole('listitem')).toHaveCount(4, { timeout: 60_000 });
    // Nothing wider than the phone, and nothing that scrolls sideways: the
    // page, and every scroller inside it (the app's <main> clips, so the
    // page alone would never show it).
    const overflow = () =>
      page.evaluate(() => {
        const w = window.innerWidth;
        const wide = [...document.querySelectorAll('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > w + 1;
        });
        const sideways = [...document.querySelectorAll('body *')].filter((el) => {
          const x = getComputedStyle(el).overflowX;
          return (x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        });
        const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        return wide.length + sideways.length + Math.max(0, page);
      });
    expect(await overflow()).toBe(0);
    await card(page, CLIENT_SUBMITTED_TITLE).click();
    await expect(page).toHaveURL(new RegExp(`[?&]id=${CLIENT_SUBMITTED_ID}`));
    await expect(requests(page)).toHaveCount(0);
    await expect(page.getByText('Submitted for review: nobody can change it now.')).toBeVisible({
      timeout: 30_000,
    });
    expect(await overflow()).toBe(0);
  });

  test('the thread’s delete shows on touch, and the composer has a name (U10)', async ({
    page,
  }) => {
    await page.goto(`/?id=${SHARED_PAGE_ID}`);
    await expect(page.getByRole('heading', { name: SHARED_PAGE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    const thread = threadOf(page);
    await expect(thread).toContainText(SHARED_TEAM_COMMENT, { timeout: 30_000 });
    await thread
      .getByRole('textbox', { name: 'Write a comment', exact: true })
      .fill('From the site.');
    await thread.getByRole('button', { name: 'Add comment' }).click();
    const del = thread.getByRole('button', { name: 'Delete comment' });
    await expect(del).toHaveCount(1);
    const opacity = await del.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0);
  });
});

test.describe('a member', () => {
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

  test('reads who wrote a client request from the item itself, from a link (U6)', async ({
    page,
  }) => {
    api.clientRequests = true;
    // The list filtered to Private has no row for it: only the item names
    // the writer.
    await page.goto(`/notes?state=private&src=client-request&id=${CLIENT_REQUEST_ID}`);
    await expect(page.getByText(CLIENT_REQUEST_TEXT)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(`Written by ${CLIENT_NAME}, Client.`)).toBeVisible();
  });

  test('the Library thread on a brain before C5: nothing shown, asked once (U12)', async ({
    page,
  }) => {
    api.libraryList = true;
    api.libraryThread = false;
    const asks: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes(`/api/member/library/${LIBRARY_CLIENT_ID}/comments`)) asks.push(r.url());
    });
    await page.clock.install();
    await page.goto(`/pages?src=library&id=${LIBRARY_CLIENT_ID}`);
    await expect(page.getByText('For the client.')).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => asks.length).toBe(1);
    await page.clock.runFor(65_000);
    await refocus(page);
    await page.clock.runFor(2_000);
    await page.waitForTimeout(500);
    expect(asks.length).toBe(1);
    await expect(page.getByRole('heading', { name: /^Comments/ })).toHaveCount(0);
    await expect(page.getByText('Could not load the comments.')).toHaveCount(0);
  });
});

test.describe('an admin', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  const client = {
    id: CLIENT_LOGIN_ID,
    email: CLIENT_EMAIL,
    displayName: CLIENT_NAME,
    contactId: null,
    disabled: false,
    createdAt: '2026-09-20T08:00:00.000Z',
    lastLoginAt: null,
    openLink: null,
    lastLinkUsedAt: null,
  };

  test('reads a client’s comment on a client-level note, answers it, and deletes it (U2)', async ({
    page,
  }) => {
    await page.goto(`/notes?selected=${CLIENT_NOTE_ID}`);
    await expect(page.getByRole('heading', { name: CLIENT_NOTE_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Client comments (1)' }).click();
    const sheet = page.getByRole('dialog', { name: 'Client comments' });
    await expect(sheet).toContainText('Clients read this thread');
    await expect(sheet).toContainText(OWNER_THREAD_CLIENT_COMMENT);
    await expect(sheet).toContainText(CLIENT_NAME);
    await expect(sheet.getByText('Client', { exact: true })).toBeVisible();

    await sheet.getByRole('textbox', { name: 'Write a comment' }).fill('Thursday works.');
    await sheet.getByRole('button', { name: 'Add comment' }).click();
    await expect(sheet).toContainText('Thursday works.');
    expect(api.admin.nodeComments[CLIENT_NOTE_ID]?.map((c) => c.body)).toEqual([
      OWNER_THREAD_CLIENT_COMMENT,
      'Thursday works.',
    ]);

    // The owner moderates: any comment may go.
    const clientsComment = sheet.locator('li').filter({ hasText: OWNER_THREAD_CLIENT_COMMENT });
    await clientsComment.getByRole('button', { name: 'Delete comment' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(sheet).not.toContainText(OWNER_THREAD_CLIENT_COMMENT);
    expect(api.admin.commentDeletes).toHaveLength(1);
  });

  test('Clients: the client comments card links each item; a client’s comments go after a confirm', async ({
    page,
  }) => {
    api.admin.clientLogins = [client];
    api.admin.clientComments = {
      rows: [
        {
          nodeId: CLIENT_NOTE_ID,
          title: CLIENT_NOTE_TITLE,
          type: 'note',
          lastCommentAt: '2026-09-29T10:00:00.000Z',
          clientComments: 2,
          lastClientName: CLIENT_NAME,
        },
      ],
    };
    await page.goto('/team-admin?view=client-logins');
    const cardEl = page.getByRole('region', { name: 'Client comments' });
    await expect(cardEl).toContainText(`2 client comments · the last by ${CLIENT_NAME}`, {
      timeout: 60_000,
    });
    await expect(cardEl.getByRole('link', { name: CLIENT_NOTE_TITLE })).toHaveAttribute(
      'href',
      `/n/${CLIENT_NOTE_ID}`,
    );

    await page.getByRole('button', { name: `More for ${CLIENT_NAME}` }).click();
    await page.getByRole('menuitem', { name: "Delete this client's comments" }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`Delete every comment ${CLIENT_NAME} wrote?`);
    expect(api.admin.clientCommentDeletes).toEqual([]);
    await dialog.getByRole('button', { name: 'Delete comments' }).click();
    await expect(toast(page, `Deleted 3 comments by ${CLIENT_NAME}.`)).toBeVisible();
    expect(api.admin.clientCommentDeletes).toEqual([CLIENT_LOGIN_ID]);
  });

  test('Clients: the storage card says the total against the limit, each client, the refusals', async ({
    page,
  }) => {
    const MB = 1024 * 1024;
    api.admin.clientLogins = [client];
    api.admin.clientStorage = {
      limits: {
        fileMaxBytes: 20 * MB,
        perClientBytes: 200 * MB,
        dailyUploadBytes: 50 * MB,
        itemLimit: 500,
        totalBytes: 5 * 1024 * MB,
        submitsPerDay: 10,
        openSubmissions: 50,
      },
      totalUsedBytes: 512 * MB,
      rows: [
        {
          loginId: CLIENT_LOGIN_ID,
          name: CLIENT_NAME,
          usedBytes: 12 * MB,
          uploadedTodayBytes: 0,
          items: 4,
          openSubmissions: 1,
          former: false,
        },
      ],
      refusals: [{ at: '2026-09-29T10:00:00.000Z', loginId: CLIENT_LOGIN_ID, reason: 'daily' }],
    };
    await page.goto('/team-admin?view=client-logins');
    const storage = page.getByRole('region', { name: 'Client storage' });
    await expect(storage).toContainText('512 MB of 5.00 GB used by all client spaces', {
      timeout: 60_000,
    });
    await expect(storage).toContainText(`${CLIENT_NAME}12 MB of 200 MB · 4 of 500 items`);
    await expect(storage).toContainText(`${CLIENT_NAME} · daily`);
  });

  test('Clients on a brain before the fixes: no comments or storage card, no delete offered', async ({
    page,
  }) => {
    api.admin.clientLogins = [client];
    const asked = page.waitForResponse((r) => r.url().includes('/api/team-admin/clients/storage'));
    await page.goto('/team-admin?view=client-logins');
    expect((await asked).status()).toBe(404);
    await expect(page.getByRole('list', { name: 'Client logins' })).toContainText(CLIENT_NAME, {
      timeout: 60_000,
    });
    await expect(page.getByRole('region', { name: 'Client comments' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Client storage' })).toHaveCount(0);
    await page.getByRole('button', { name: `More for ${CLIENT_NAME}` }).click();
    await expect(page.getByRole('menuitem', { name: 'End sessions' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /comments/ })).toHaveCount(0);
    await expect(page.getByText(/Couldn.t load/)).toHaveCount(0);
  });
});
