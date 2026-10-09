import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_ACCEPTED_FILE_ID,
  CLIENT_ACCEPTED_FILE_NAME,
  CLIENT_ACCEPTED_ID,
  CLIENT_DRAFT_ID,
  CLIENT_DRAFT_TITLE,
  CLIENT_EMAIL,
  CLIENT_HELD_ID,
  CLIENT_HELD_TITLE,
  CLIENT_LOGIN_ID,
  CLIENT_NAME,
  CLIENT_REQUEST_ID,
  CLIENT_REQUEST_TEXT,
  CLIENT_RETURNED_ID,
  CLIENT_SUBMITTED_ID,
  CLIENT_SUBMITTED_TITLE,
  SHARED_FILE_ID,
  SHARED_NOTE_ID,
  SHARED_PAGE_ID,
  SHARED_PAGE_TITLE,
  signInAsAdmin,
  serveSameOrigin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The client logins C5 audit fixes, against the in-memory API (no brain):
 * a client's screens name no staff role (U3), an older brain is asked once
 * (U4, with the clock moved on and a focus), a member's client request
 * names its writer (U6), a crafted id stays one path segment (U8), Back
 * after a search restores the list (U9), and the missing behaviour tests
 * (U12). The admin side: the clients' storage card (Settings > Logins >
 * Client settings), left out on an older brain. (The comment threads and their cases are gone with comments,
 * 2026-10-09.)
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

/** A focus back on the tab, as TanStack Query hears it: v5 listens for
 *  `visibilitychange` on the window only (focusManager). */
const refocus = (page: Page) =>
  page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('visibilitychange'));
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
    await expect(page.getByText('Rejected by the reviewer')).toBeVisible({ timeout: 30_000 });
    expect(await readable(page)).not.toMatch(/admin/i);
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'Shared items' })).toBeVisible({
      timeout: 30_000,
    });
    expect(await readable(page)).not.toMatch(/admin/i);
    expect(api.clientCalls).toEqual([]);
  });

  test('name no staff role: a failed save, an embed refusal, the sign-in page with no link (tier U6)', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    // Two 5xx in a row: the queue's own sentence, in client words.
    api.clientOwn.draftAnswer = { status: 500, body: { error: 'Internal error' } };
    await page.goto(`/?view=requests&id=${CLIENT_DRAFT_ID}`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('We would like a site visit.', { timeout: 60_000 });
    await editor.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' On Friday.');
    // The line under the editor, and the toast: both in client words.
    await expect(page.getByText('tell the team if it keeps happening')).toHaveCount(2, {
      timeout: 15_000,
    });
    expect(await readable(page)).not.toMatch(/admin/i);

    // An embed refusal the brain sent no sentence with: the fallback, in
    // client words (a client has no Library).
    api.clientOwn.draftAnswer = { status: 409, body: { error: 'forbidden', reason: 'embed' } };
    await page.reload();
    await expect(editor).toContainText('We would like a site visit.', { timeout: 60_000 });
    await editor.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' On Monday.');
    await expect(page.getByText('only your own items and items shared with you')).toHaveCount(2, {
      timeout: 15_000,
    });
    expect(await readable(page)).not.toMatch(/admin|Library/i);
    expect(api.clientCalls).toEqual([]);

    // Signed out, with no link: how to get one, in client words. (A tab of
    // its own: this one holds unsaved typing, so leaving it asks first.)
    await context.clearCookies();
    api.clientSession = false;
    api.clientCodes = false;
    // On the brain's own origin, as a client signs in (serveSameOrigin):
    // this suite runs split-origin, where the page rightly says client
    // sign-in is not available, and its no-link words show only until
    // hydration (some 50 ms), so a check there passed with the page's speed.
    const own = await browser.newContext({ baseURL });
    await serveSameOrigin(own, baseURL!);
    const signin = await own.newPage();
    await signin.goto('/client-signin');
    await expect(signin.getByText('Open the sign-in link you were sent.')).toBeVisible({
      timeout: 60_000,
    });
    expect(await readable(signin)).not.toMatch(/admin/i);
    await own.close();
  });

  test('a big save a reload cut off is sent again on the next open (tier U7)', async ({ page }) => {
    // Over the 64 KB keepalive cap: the write goes out as a plain request,
    // which dies with the page, so only the kept copy can bring it back.
    const item = api.clientOwn.items.find((i) => i.row.id === CLIENT_DRAFT_ID)!;
    if (item.body.type !== 'page') throw new Error('the draft is a page');
    const long = 'Long line of the brief. '.repeat(3200);
    item.body.page.doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Rescue start.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: long }] },
      ],
    };
    // The brain never answers this write (the reload cuts it off).
    let held!: () => void;
    const sent = new Promise<void>((resolve) => (held = resolve));
    await page.route('**/api/client/space/*/draft', () => held());

    await page.goto(`/?view=requests&id=${CLIENT_DRAFT_ID}`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('Rescue start.', { timeout: 60_000 });
    await editor.locator('p').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Kept words.');
    await sent;
    const kept = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('mantle_member_rescue:')),
    );
    expect(kept).toEqual([
      `mantle_member_rescue:${encodeURIComponent(`client:${CLIENT_LOGIN_ID}`)}:/api/client/space/${CLIENT_DRAFT_ID}/draft`,
    ]);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.reload();
    await expect(editor).toContainText('Rescue start. Kept words.', { timeout: 60_000 });
    expect(JSON.stringify(item.body.page.draft)).toContain('Kept words.');
    expect(api.clientCalls).toEqual([]);
  });

  test('the own page editor reads pictures from the client routes; a sub-page card asks nothing (tier U2, U3)', async ({
    page,
  }) => {
    const item = api.clientOwn.items.find((i) => i.row.id === CLIENT_DRAFT_ID)!;
    if (item.body.type !== 'page') throw new Error('the draft is a page');
    item.body.page.doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Pictures below.' }] },
        {
          type: 'image',
          attrs: { src: `/api/files/files/${SHARED_FILE_ID}?raw=1`, nodeId: SHARED_FILE_ID },
        },
        { type: 'childPage', attrs: { pageId: SHARED_PAGE_ID, title: SHARED_PAGE_TITLE } },
      ],
    };
    const bytes = page.waitForRequest(
      (r) => r.url().includes(`/api/client/files/${SHARED_FILE_ID}`),
      {
        timeout: 60_000,
      },
    );
    await page.goto(`/?view=requests&id=${CLIENT_DRAFT_ID}`);
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('Pictures below.', { timeout: 60_000 });
    await bytes;
    await expect(editor.locator('img').first()).toHaveAttribute(
      'src',
      new RegExp(`/api/client/files/${SHARED_FILE_ID}`),
    );
    // The card keeps its title, and is no link a client could follow.
    await expect(editor).toContainText(SHARED_PAGE_TITLE);
    await expect(editor.locator('a[href^="/pages/"]')).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(api.clientCalls).toEqual([]);
  });

  test('note pictures read the client routes, and no other picture loads (tier U4)', async ({
    page,
  }) => {
    const drawId = '46464646-4646-4464-8464-464646464646';
    api.noteExtra =
      `\n\n![plan](/api/files/files/${SHARED_FILE_ID}?raw=1) ![photo](media:${SHARED_FILE_ID})` +
      ` ![sketch](draw:${drawId}) ![pixel](https://tracker.example/p.gif)` +
      ` ![team](/api/member/files/${SHARED_FILE_ID})`;
    const elsewhere: string[] = [];
    await page.route('https://tracker.example/**', (route) => {
      elsewhere.push(route.request().url());
      return route.abort();
    });
    const pictures = (root: import('@playwright/test').Locator) =>
      root.locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));

    for (const [path, done] of [
      [`/?id=${SHARED_NOTE_ID}`, 'Agreed: ship it.'],
      [`/?view=requests&id=${CLIENT_ACCEPTED_ID}&src=accepted`, 'The site is open 7 to 5'],
    ] as const) {
      await page.goto(path);
      const note = page.locator('article').filter({ hasText: done });
      await expect(note).toBeVisible({ timeout: 60_000 });
      await expect(note.locator('img')).toHaveCount(3);
      const srcs = await pictures(note);
      expect(srcs.map((src) => new URL(src, 'http://x').pathname)).toEqual([
        `/api/client/files/${SHARED_FILE_ID}`,
        `/api/client/files/${SHARED_FILE_ID}`,
        `/api/client/draws/${drawId}/svg`,
      ]);
      await expect(note).toContainText('[pixel]');
      await expect(note).toContainText('[team]');
    }
    await page.waitForTimeout(500);
    expect(elsewhere).toEqual([]);
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

  test('Client settings: the storage card says the total against the limit, each client, the refusals', async ({
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
      refusals: [
        { at: '2026-09-29T10:00:00.000Z', loginId: CLIENT_LOGIN_ID, reason: 'daily-upload' },
      ],
    };
    await page.goto('/settings/users?selected=client-settings');
    const storage = page.getByRole('region', { name: 'Client storage' });
    await expect(storage).toContainText('512 MB of 5.00 GB used by all client spaces', {
      timeout: 60_000,
    });
    await expect(storage).toContainText(`${CLIENT_NAME}12 MB of 200 MB · 4 of 500 items`);
    await expect(storage).toContainText(`${CLIENT_NAME} · the day's uploads are used up`);
  });

  test('Clients on a brain before the fixes: no comments or storage card, no comment delete offered', async ({
    page,
  }) => {
    api.admin.clientLogins = [client];
    const asked = page.waitForResponse((r) => r.url().includes('/api/team-admin/clients/storage'));
    await page.goto('/settings/users?selected=client-settings');
    expect((await asked).status()).toBe(404);
    const clients = page.getByRole('region', { name: /^Clients/ });
    await expect(clients).toContainText(CLIENT_NAME, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Client comments' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Client storage' })).toHaveCount(0);
    // The client login's own controls: the generic login ones, and nothing
    // about comments.
    await clients.getByRole('button', { name: new RegExp(CLIENT_NAME) }).click();
    await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /comments/ })).toHaveCount(0);
    await expect(page.getByText(/Couldn.t load/)).toHaveCount(0);
  });
});
