import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_CODE_NOT_VALID,
  CLIENT_CODE_RATE_EMAIL,
  CLIENT_EMAIL,
  CLIENT_EMAIL_CODE,
  CLIENT_GOOD_CODE,
  CLIENT_ITEM_TITLE,
  CLIENT_NAME,
  CLIENT_RATE_CODE,
  CLIENT_SITE,
  LEAKY_SUMMARY,
  LIBRARY_CLIENT_TITLE,
  LIBRARY_TITLE,
  MOCK_PEER,
  PRIVATE_LABEL,
  SHARED_FILE_ID,
  SHARED_FILE_TITLE,
  SHARED_LATER_TITLE,
  SHARED_NOTE_TITLE,
  SHARED_PAGE_TITLE,
  SHARED_TABLE_TITLE,
  SENDER_DESK,
  SENDER_INFO,
  TABLE_DESCRIPTION,
  serveSameOrigin,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The client portal (client logins C2), against the in-memory API (no
 * brain): the sign-in link page, sign-in by an emailed code (C2b), the
 * client chrome and "Shared with you" with its read-only viewers, an ended
 * session, and the admin's Team admin > Clients with its sign-in code sender. A client asks client routes only: every other route the page
 * calls is refused and recorded (`clientCalls`), and each client test ends
 * with none.
 */
let api: MockMemberApi;
test.afterEach(async () => {
  await api?.close();
});

/** A browser the portal already knows as a client's: the presence cookie
 *  and the client hint (both UX-only; the API is mocked). */
async function signInAsClient(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: 'mantle_authed', value: '1', url: baseURL },
    { name: 'mantle_client', value: '1', url: baseURL },
  ]);
}

const heading = (page: Page) => page.getByRole('heading', { name: 'Shared with you' });
const list = (page: Page) => page.getByRole('list', { name: 'Shared items' });

test.describe('the sign-in link', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    api.clientSession = false;
    // A client signs in on the brain's own origin only.
    await serveSameOrigin(context, baseURL!);
  });

  test('a link carries its code in the fragment: read, gone from the address, signed in (B12)', async ({
    page,
  }) => {
    const res = await page.goto(`/client-signin#code=${CLIENT_GOOD_CODE}`);
    // No Referer from this page can name a code.
    expect(res?.headers()['referrer-policy']).toBe('no-referrer');
    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/client-signin$/);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    await email.fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    expect(api.clientSignIns).toEqual([
      { code: CLIENT_GOOD_CODE, email: CLIENT_EMAIL, status: 200 },
    ]);
    expect(api.clientCalls).toEqual([]);
  });

  test('the sign-in page names the site or the product, never the box (B27)', async ({ page }) => {
    // The box's peer name is served: /login shows it.
    await page.goto('/login');
    await expect(page.getByText(MOCK_PEER)).toBeVisible({ timeout: 60_000 });
    await page.goto('/client-signin');
    await expect(page.getByText('Open the sign-in link you were sent.')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page).toHaveTitle('Sign in · Jackdaw');
    await expect(page.getByText(MOCK_PEER)).toHaveCount(0);
  });

  test('a good link and the right email sign the client in, to the home', async ({
    page,
    context,
  }) => {
    await page.goto(`/client-signin?code=${CLIENT_GOOD_CODE}`);
    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toBeVisible({ timeout: 60_000 });
    // The code leaves the address bar once read.
    await expect(page).toHaveURL(/\/client-signin$/);
    await email.fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/$/);
    expect(api.clientSignIns).toEqual([
      { code: CLIENT_GOOD_CODE, email: CLIENT_EMAIL, status: 200 },
    ]);
    const names = (await context.cookies()).map((c) => c.name);
    expect(names).toContain('mantle_client');
    expect(names).not.toContain('mantle_member');
    expect(api.clientCalls).toEqual([]);
  });

  test('a link that signs nobody in says so, and stays', async ({ page }) => {
    await page.goto('/client-signin?code=NotARealCode2345');
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('This sign-in link is not valid. Ask for a new one.')).toBeVisible({
      timeout: 30_000,
    });
    // The wrong email is the same one sentence.
    await page.goto(`/client-signin?code=${CLIENT_GOOD_CODE}`);
    await page.getByLabel('Email', { exact: true }).fill('someone@example.invalid');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('This sign-in link is not valid. Ask for a new one.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/client-signin$/);
  });

  test('the rate limit has its own sentence', async ({ page }) => {
    await page.goto(`/client-signin?code=${CLIENT_RATE_CODE}`);
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Too many attempts. Try again in a minute.')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('without a code: how to get in, and no form', async ({ page }) => {
    await page.goto('/client-signin');
    await expect(page.getByText('Open the sign-in link you were sent.')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  });
});

const SENT =
  'If this email has a client login, we sent it a code. It works for 10 minutes, in this browser.';
const sentNotice = (page: Page) => page.getByTestId('client-code-sent');

test.describe('the email sign-in code', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    api.clientSession = false;
    api.clientCodes = true;
    await serveSameOrigin(context, baseURL!);
  });

  test('email, a wrong code (one sentence, nothing signed in), the right one: the home', async ({
    page,
    context,
  }) => {
    await page.goto('/client-signin');
    await expect(page.getByText('Sign in with a code sent to your email.')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(sentNotice(page)).toHaveText(SENT, { timeout: 30_000 });
    expect(api.clientCodeRequests).toEqual([{ email: CLIENT_EMAIL, status: 200 }]);

    const code = page.getByLabel('Enter the 8-digit code');
    await code.fill('1111 2222');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(CLIENT_CODE_NOT_VALID)).toBeVisible({ timeout: 30_000 });
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    // Nothing of a session: still here, no client hint, the code step as it was.
    await expect(page).toHaveURL(/\/client-signin$/);
    expect((await context.cookies()).map((c) => c.name)).not.toContain('mantle_client');
    await expect(sentNotice(page)).toHaveText(SENT);

    // Pasted with spaces: they come out.
    await code.fill(' 2468 1357 ');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/$/);
    expect(api.clientCodeVerifies).toEqual([
      { email: CLIENT_EMAIL, code: '11112222', status: 401 },
      { email: CLIENT_EMAIL, code: CLIENT_EMAIL_CODE, status: 200 },
    ]);
    const names = (await context.cookies()).map((c) => c.name);
    expect(names).toContain('mantle_client');
    expect(names).not.toContain('mantle_member');
    expect(api.clientCalls).toEqual([]);
  });

  test('a stranger reads exactly what a client reads, and moves on the same', async ({ page }) => {
    const codeStep = async (email: string) => {
      await page.goto('/client-signin');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByRole('button', { name: 'Email me a code' }).click();
      await expect(page.getByLabel('Enter the 8-digit code')).toBeVisible({ timeout: 30_000 });
      return (await page.locator('section').first().innerText()).replaceAll(email, 'EMAIL');
    };
    const client = await codeStep(CLIENT_EMAIL);
    const stranger = await codeStep('nobody@example.invalid');
    expect(stranger).toBe(client);
    expect(client).toContain(SENT);
  });

  test('the code waits for 8 digits; Send a new code and Use a different email', async ({
    page,
  }) => {
    await page.goto('/client-signin');
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_EMAIL);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    const code = page.getByLabel('Enter the 8-digit code');
    await code.fill('1234');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('The code is 8 digits.')).toBeVisible();
    expect(api.clientCodeVerifies).toEqual([]);

    await page.getByRole('button', { name: 'Send a new code' }).click();
    await expect(sentNotice(page)).toHaveText(`Asked again. ${SENT}`, { timeout: 30_000 });
    expect(api.clientCodeRequests.map((r) => r.email)).toEqual([CLIENT_EMAIL, CLIENT_EMAIL]);

    await page.getByRole('button', { name: 'Use a different email' }).click();
    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toHaveValue(CLIENT_EMAIL);
    await expect(page.getByLabel('Enter the 8-digit code')).toHaveCount(0);
  });

  test('a rate-limited request has its own sentence, and stays on the email', async ({ page }) => {
    await page.goto('/client-signin');
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_CODE_RATE_EMAIL);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByText('Too many attempts. Wait a minute, then try again.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel('Enter the 8-digit code')).toHaveCount(0);
  });

  test('from /login and from a link page: the way to a code', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign in with an email code' }).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/client-signin$/);
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(`/client-signin?code=${CLIENT_GOOD_CODE}`);
    await page
      .getByRole('button', { name: 'Sign in with an email code instead' })
      .click({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
    expect(api.clientCalls).toEqual([]);
  });

  test('codes off: no code anywhere, and the page says to ask for a link', async ({ page }) => {
    api.clientCodes = false;
    await page.goto('/login');
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Sign in with an email code' })).toHaveCount(0);
    await page.goto('/client-signin');
    await expect(page.getByText('ask the team for a new one')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0);
    await page.goto(`/client-signin?code=${CLIENT_GOOD_CODE}`);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole('button', { name: 'Sign in with an email code instead' }),
    ).toHaveCount(0);
  });
});

test.describe('client sign-in on a split box (the API on another origin, B27)', () => {
  test.beforeEach(async ({ baseURL }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    api.clientSession = false;
    api.clientCodes = true;
  });

  test('no form, one plain line, and nothing is posted', async ({ page }) => {
    for (const path of [`/client-signin#code=${CLIENT_GOOD_CODE}`, '/client-signin']) {
      await page.goto(path);
      await expect(page.getByText('Client sign-in is not available on this address.')).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Email me a code' })).toHaveCount(0);
    }
    // The code still left the address.
    await expect(page).toHaveURL(/\/client-signin$/);
    expect(api.clientSignIns).toEqual([]);
    expect(api.clientCodeRequests).toEqual([]);
  });
});

test.describe('a signed-in client', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    await signInAsClient(context, baseURL!);
  });

  test('the client chrome: the brand, the account, one screen', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: `${CLIENT_SITE} home` }).first()).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Primary' });
    // Two screens since C5: what is shared, and what the client sent.
    await expect(nav.getByRole('link')).toHaveText(['Shared with you', 'My requests']);
    const account = page.getByRole('button', { name: /^Account/ }).first();
    // The house style: no em or en dash, not even in an accessible name
    // (tier N7). Named by code point so this file carries neither.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(await account.getAttribute('aria-label')).not.toMatch(dashes);
    await account.click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText(CLIENT_NAME);
    await expect(menu.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Sign out everywhere' })).toBeVisible();
    for (const gone of ['Profile', 'Change password', 'Take the tour', 'Search everywhere…']) {
      await expect(menu.getByRole('menuitem', { name: gone })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    // No search palette for a client.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(api.clientCalls).toEqual([]);
  });

  test('Sign out everywhere speaks of browsers only (B14)', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await page
      .getByRole('button', { name: /^Account/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Sign out everywhere' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Every browser you signed in on must sign in again');
    await expect(confirm).not.toContainText('phone app');
    await expect(confirm).not.toContainText('connected client');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect(api.logouts).toEqual([]);
  });

  test('Shared with you: newest first, by kind, by title', async ({ page }) => {
    await page.goto('/');
    await expect(list(page).getByRole('listitem')).toHaveCount(3, { timeout: 60_000 });
    await expect(list(page).getByRole('listitem').first()).toContainText(SHARED_PAGE_TITLE);
    // Never the summary an older brain still sends (B1).
    await expect(page.getByText(LEAKY_SUMMARY)).toHaveCount(0);

    // The kind is the list kit's quiet filter (item-list alignment), and
    // it lives in the URL like the search.
    await page.getByRole('button', { name: 'Everything', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Notes' }).click();
    await expect(page).toHaveURL(/[?&]kind=note/);
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(list(page)).toContainText(SHARED_NOTE_TITLE);

    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Everything' }).click();
    await page.getByRole('textbox', { name: 'Search by title' }).fill('plan');
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(list(page)).toContainText(SHARED_FILE_TITLE);
    await expect(page).toHaveURL(/[?&]q=plan/);
    expect(api.clientRouteCalls).toContain('GET /api/client/shared');
    expect(api.clientCalls).toEqual([]);
  });

  test('a page reads read-only: a redacted reference is plain text, a shared link opens here', async ({
    page,
  }) => {
    await page.goto('/');
    await list(page).getByText(SHARED_PAGE_TITLE).click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\?id=/);
    const body = page.locator('.ProseMirror');
    await expect(body).toContainText('The brief.', { timeout: 30_000 });
    await expect(body).toContainText(PRIVATE_LABEL);
    // Neither redaction is a link or a chip.
    await expect(body.getByRole('link', { name: PRIVATE_LABEL })).toHaveCount(0);
    await expect(body.locator('.mention', { hasText: PRIVATE_LABEL })).toHaveCount(0);
    // No summary in the reader either (B1).
    await expect(page.getByText(LEAKY_SUMMARY)).toHaveCount(0);
    // No edit, share, access or comments here.
    for (const name of ['Edit', 'Share', 'Access', 'Comments']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
    // A link to another shared item opens it in the portal.
    await body.getByRole('link', { name: 'the meeting notes' }).click();
    await expect(page.getByRole('heading', { name: SHARED_NOTE_TITLE })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/\?id=14141414/);
    expect(api.clientCalls).toEqual([]);
  });

  test('a mention of a readable item opens it here; a file embed downloads from the client route (B27)', async ({
    page,
    context,
    baseURL,
  }) => {
    await serveSameOrigin(context, baseURL!);
    await page.goto('/');
    await list(page).getByText(SHARED_PAGE_TITLE).click({ timeout: 60_000 });
    const body = page.locator('.ProseMirror');
    const chip = body.locator(`a.file-embed`);
    await expect(chip).toContainText(SHARED_FILE_TITLE, { timeout: 30_000 });
    // The chip is a download on the client byte route; the reader saves it
    // with this moment's asset URL (the anchor it clicks is caught here).
    expect(await chip.getAttribute('href')).toBe(`/api/client/files/${SHARED_FILE_ID}`);
    expect(await chip.getAttribute('download')).toBe(SHARED_FILE_TITLE);
    await page.evaluate(() => {
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        (window as unknown as { __saved?: unknown }).__saved = {
          href: this.getAttribute('href'),
          download: this.getAttribute('download'),
        };
      };
    });
    await chip.click();
    expect(await page.evaluate(() => (window as unknown as { __saved?: unknown }).__saved)).toEqual(
      { href: `/api/client/files/${SHARED_FILE_ID}`, download: SHARED_FILE_TITLE },
    );
    // Still on the page it was read on.
    await expect(page).toHaveURL(/\/\?id=13131313/);

    await body.locator('.mention', { hasText: SHARED_NOTE_TITLE }).click();
    await expect(page.getByRole('heading', { name: SHARED_NOTE_TITLE })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/\?id=14141414/);
    expect(api.clientCalls).toEqual([]);
  });

  test('the list and the open item refresh on focus, with no reload (B27)', async ({ page }) => {
    await page.goto('/');
    await expect(list(page).getByRole('listitem')).toHaveCount(3, { timeout: 60_000 });
    api.sharedLater = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(list(page).getByRole('listitem').first()).toContainText(SHARED_LATER_TITLE, {
      timeout: 15_000,
    });
    await expect(list(page).getByRole('listitem')).toHaveCount(4);
  });

  test('an offline first load shows the failure card with Sign out, not Loading (B27)', async ({
    page,
    context,
  }) => {
    // The first ask of the shell is in flight when the device goes offline.
    let release = () => {};
    const held = new Promise<void>((r) => (release = r));
    const shell = /\/api\/client\/shell/;
    await context.route(shell, async (route) => {
      await held;
      await route.abort('internetdisconnected');
    });
    const asked = page.waitForRequest(shell);
    await page.goto('/', { waitUntil: 'commit' });
    await asked;
    await context.setOffline(true);
    release();
    await expect(page.getByText(/This device is offline\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // Back online: the portal loads.
    await context.unroute(shell);
    await context.setOffline(false);
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
  });

  test('Sign out on the failure card goes to the client sign-in, not the staff one (tier U12)', async ({
    page,
  }) => {
    api.clientShellFailures = 1000;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Could not load your workspace' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/client-signin$/, { timeout: 30_000 });
    expect(api.logouts.map((l) => l.path)).toContain('/api/auth/logout');
  });

  test('the tab names the site, never the box (B27)', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveTitle(CLIENT_SITE);
    await expect(page.getByText(MOCK_PEER)).toHaveCount(0);
  });

  test('a table reads in either shape, and nothing but the grid shows (B13)', async ({ page }) => {
    for (const shape of ['allowlisted', 'record'] as const) {
      api.sharedTable = shape;
      await page.goto('/');
      await list(page).getByText(SHARED_TABLE_TITLE).click({ timeout: 60_000 });
      const grid = page.getByRole('table');
      await expect(grid).toContainText('Survey', { timeout: 30_000 });
      await expect(grid).toContainText('Report');
      await expect(page.getByText(TABLE_DESCRIPTION)).toHaveCount(0);
      await expect(page.getByText(LEAKY_SUMMARY)).toHaveCount(0);
    }
    expect(api.clientCalls).toEqual([]);
  });

  test('a note: a redacted link is plain text', async ({ page }) => {
    await page.goto('/');
    await list(page).getByText(SHARED_NOTE_TITLE).click({ timeout: 60_000 });
    const note = page.locator('article');
    await expect(note).toContainText('Agreed: ship it.', { timeout: 30_000 });
    await expect(note).toContainText(PRIVATE_LABEL);
    await expect(note.getByRole('link')).toHaveCount(0);
  });

  test('a file downloads from the client route', async ({ page }) => {
    await page.goto('/');
    await list(page).getByText(SHARED_FILE_TITLE).click({ timeout: 60_000 });
    const download = page.getByRole('link', { name: 'Download' }).first();
    await expect(download).toBeVisible({ timeout: 30_000 });
    expect(await download.getAttribute('href')).toContain('/api/client/files/');
    expect(await download.getAttribute('download')).toBe(SHARED_FILE_TITLE);
  });

  test('an owner path, or a permalink, goes to the portal', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/n/14141414-1414-4141-8141-141414141414');
    await expect(page.getByRole('heading', { name: SHARED_NOTE_TITLE })).toBeVisible({
      timeout: 30_000,
    });
    expect(api.clientCalls).toEqual([]);
  });

  test('an ended session goes to the client sign-in page', async ({ page, context, baseURL }) => {
    await serveSameOrigin(context, baseURL!);
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    // An admin ended the sessions: the next ask is a 401, and the portal
    // goes to sign in by itself. Focus asks the list again at once (the
    // shell's own poll would too, within a minute); a reload here raced
    // that redirect (ERR_ABORTED), so the spec waits for it instead.
    api.clientSession = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL(/\/client-signin$/, { timeout: 30_000 });
    await expect(page.getByText('Open the sign-in link you were sent.')).toBeVisible();
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await list(page).getByText(SHARED_PAGE_TITLE).click();
    await expect(page.locator('.ProseMirror')).toContainText('The brief.', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(heading(page)).toBeVisible();
  });
});

test.describe('Team admin > Clients', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseURL!).origin,
    });
  });

  test('Add client and Issue sign-in link wait for What clients see', async ({ page }) => {
    await page.goto('/team-admin?view=client-logins');
    const add = page.getByRole('button', { name: 'Add client' });
    await expect(add).toBeDisabled({ timeout: 60_000 });
    await expect(page.getByText('Check the list in What clients see first')).toBeVisible();

    // Check the report, then come back.
    await page.getByRole('link', { name: 'What clients see' }).last().click();
    await expect(page.getByRole('link', { name: CLIENT_ITEM_TITLE })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'I have checked this list' }).click();
    await expect(page.getByText(/checked this list on/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    await expect(add).toBeEnabled({ timeout: 30_000 });

    await add.click();
    await page.getByLabel('Email', { exact: true }).fill(CLIENT_EMAIL);
    await page.getByLabel('Name (optional)').fill(CLIENT_NAME);
    await page.getByRole('dialog').getByRole('button', { name: 'Add client' }).click();
    await expect(page.getByText(CLIENT_NAME).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No open sign-in link')).toBeVisible();

    // The link, once, as the full URL on this app's origin, its code in
    // the fragment (B12).
    const issue = page.getByRole('button', { name: `Issue a sign-in link for ${CLIENT_NAME}` });
    await issue.click();
    const link = page.getByLabel('Sign-in link', { exact: true });
    await expect(link).toHaveValue(
      new RegExp(`^https?://[^/]+/client-signin#code=${CLIENT_GOOD_CODE}$`),
      { timeout: 15_000 },
    );
    // Shown once: no Escape, no click outside, no corner X loses it (B27).
    const dialog = page.getByRole('dialog', { name: 'Sign-in link ready' });
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/Sign-in link open until/)).toBeVisible();
    expect(api.admin.signinLinksIssued).toHaveLength(1);

    // A new link over the open one asks first (B27), and Copy closes it.
    await issue.click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(`Issue a new sign-in link for ${CLIENT_NAME}?`);
    await expect(confirm).toContainText('stops working now');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect(api.admin.signinLinksIssued).toHaveLength(1);
    await issue.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Issue new link' }).click();
    await expect(link).toBeVisible({ timeout: 15_000 });
    expect(api.admin.signinLinksIssued).toHaveLength(2);
    await page.getByRole('button', { name: 'Copy the sign-in link' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  });

  test('a client login is ended, disabled and deleted from its menu', async ({ page }) => {
    api.admin.clientAcks.push(['x']);
    api.admin.clientLogins.push({
      id: '16161616-1616-4161-8161-161616161616',
      email: CLIENT_EMAIL,
      displayName: CLIENT_NAME,
      contactId: null,
      disabled: false,
      createdAt: '2026-09-20T08:00:00.000Z',
      lastLoginAt: null,
      openLink: null,
      lastLinkUsedAt: null,
    });
    await page.goto('/team-admin?view=client-logins');
    const more = page.getByRole('button', { name: `More for ${CLIENT_NAME}` });
    // End sessions says what it does, and where a lockout is (B14).
    await more.click({ timeout: 60_000 });
    await page.getByRole('menuitem', { name: 'End sessions' }).click();
    const end = page.getByRole('alertdialog');
    await expect(end).toContainText('any open sign-in link is revoked');
    await expect(end).toContainText('To keep them out, disable the login instead.');
    await expect(end).not.toContainText('need a new sign-in link');
    await end.getByRole('button', { name: 'Cancel' }).click();
    await more.click();
    await page.getByRole('menuitem', { name: 'Disable' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible({ timeout: 15_000 });
    expect(api.admin.userPatches).toEqual([
      { id: '16161616-1616-4161-8161-161616161616', body: { disabled: true } },
    ]);

    await more.click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No client logins yet.')).toBeVisible({ timeout: 15_000 });
    expect(api.admin.userDeletes).toEqual(['16161616-1616-4161-8161-161616161616']);
  });
});

test.describe('Team admin > Clients > Sign-in codes by email', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  const picker = (page: Page) => page.getByRole('combobox', { name: 'Send codes from' });

  test('pick a sender, the folders kept out, a refusal, then None', async ({ page }) => {
    await page.goto('/team-admin?view=client-logins');
    await expect(page.getByRole('heading', { name: 'Sign-in codes by email' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/^Codes are off\./)).toBeVisible();
    await expect(page.getByText('0 of 200 codes sent in the last 24 hours.')).toBeVisible();
    await expect(page.getByTestId('client-codes-cap')).toHaveCount(0);

    // Picking asks the brain first, and confirms naming the folders (B4).
    await picker(page).click();
    await page.getByRole('option', { name: SENDER_DESK.address }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText(`Send sign-in codes from ${SENDER_DESK.address}?`, {
      timeout: 15_000,
    });
    await expect(confirm).toContainText('left out of mail sync');
    await expect(confirm).toContainText('Sent, Sent Items');
    expect(api.admin.signinSender.previewCalls).toEqual([SENDER_DESK.id]);
    // Cancel changes nothing.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect(api.admin.signinSender.puts).toEqual([]);
    await expect(page.getByText(/^Codes are off\./)).toBeVisible();

    await picker(page).click();
    await page.getByRole('option', { name: SENDER_DESK.address }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use this account' }).click();
    await expect(
      page.getByText('Sent mail from this account is kept out of the brain: Sent, Sent Items.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(picker(page)).toContainText(SENDER_DESK.address);

    // The preview refuses an account the brain cannot keep out: no dialog,
    // no save.
    api.admin.signinSender.previews[SENDER_INFO.id] = {
      sentFolders: [],
      canUse: false,
      reason: 'no-sent-folder',
    };
    await picker(page).click();
    await page.getByRole('option', { name: SENDER_INFO.address }).click();
    await expect(page.getByText(/That account has no sent-mail folder/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(picker(page)).toContainText(SENDER_DESK.address);

    // The save itself refused (the account stopped being able to send).
    delete api.admin.signinSender.previews[SENDER_INFO.id];
    api.admin.signinSender.refusal = {
      status: 400,
      body: { error: 'That account cannot send.', reason: 'account-cannot-send' },
    };
    await picker(page).click();
    await page.getByRole('option', { name: SENDER_INFO.address }).click();
    const again = page.getByRole('alertdialog');
    // The folders of the sender now come back.
    await expect(again).toContainText('These come back into mail sync: Sent, Sent Items.', {
      timeout: 15_000,
    });
    await again.getByRole('button', { name: 'Use this account' }).click();
    await expect(page.getByText(/That account cannot send: it needs IMAP and SMTP/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(picker(page)).toContainText(SENDER_DESK.address);

    // None says the folders come back.
    await picker(page).click();
    await page.getByRole('option', { name: 'None (codes off)' }).click();
    const off = page.getByRole('alertdialog');
    await expect(off).toContainText('Turn sign-in codes off?', { timeout: 15_000 });
    await expect(off).toContainText('These folders come back into mail sync: Sent, Sent Items.');
    await off.getByRole('button', { name: 'Turn codes off' }).click();
    await expect(page.getByText(/^Codes are off\./)).toBeVisible({ timeout: 15_000 });
    expect(api.admin.signinSender.puts).toEqual([
      { accountId: SENDER_DESK.id },
      { accountId: SENDER_INFO.id },
      { accountId: null },
    ]);
  });

  test('an older brain (no preview): still confirmed, without folder names', async ({ page }) => {
    api.admin.signinSender.preview = false;
    await page.goto('/team-admin?view=client-logins');
    await picker(page).click({ timeout: 60_000 });
    await page.getByRole('option', { name: SENDER_DESK.address }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Its sent-mail folders are left out of mail sync', {
      timeout: 15_000,
    });
    await confirm.getByRole('button', { name: 'Use this account' }).click();
    await expect(picker(page)).toContainText(SENDER_DESK.address, { timeout: 15_000 });
    expect(api.admin.signinSender.puts).toEqual([{ accountId: SENDER_DESK.id }]);
  });

  test('delivered, failed, skipped, the last failure, and no email worker (B3)', async ({
    page,
  }) => {
    api.admin.signinSender.senderId = SENDER_DESK.id;
    api.admin.signinSender.extra = {
      deliveredLast24h: 4,
      failedLast24h: 1,
      capSkipsLast24h: 2,
      lastFailure: { at: '2026-09-29T08:00:00.000Z', reason: '535 Authentication failed' },
      emailWorker: false,
    };
    await page.goto('/team-admin?view=client-logins');
    await expect(page.getByTestId('client-codes-count')).toHaveText(
      '4 of 200 codes delivered in the last 24 hours, 1 send failed, 2 requests skipped at a limit.',
      { timeout: 60_000 },
    );
    await expect(page.getByTestId('client-codes-last-failure')).toContainText(
      '535 Authentication failed',
    );
    await expect(page.getByTestId('client-codes-worker-off')).toContainText(
      'The email worker is not running on this box: codes are off.',
    );
  });

  test('the daily cap reached: the banner', async ({ page }) => {
    api.admin.signinSender.senderId = SENDER_DESK.id;
    api.admin.signinSender.sentLast24h = 201;
    api.admin.signinSender.capReached = true;
    await page.goto('/team-admin?view=client-logins');
    await expect(page.getByTestId('client-codes-cap')).toHaveText(
      'The daily limit of 200 sign-in codes is reached. Requests are still accepted, but no code is sent until the window moves on.',
      { timeout: 60_000 },
    );
    await expect(page.getByText('201 of 200 codes sent in the last 24 hours.')).toBeVisible();
  });

  test('a sender gone from the brain says so', async ({ page }) => {
    api.admin.signinSender.refusal = {
      status: 404,
      body: { error: 'Email account not found.', reason: 'account-not-found' },
    };
    await page.goto('/team-admin?view=client-logins');
    await picker(page).click({ timeout: 60_000 });
    await page.getByRole('option', { name: SENDER_INFO.address }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Use this account' }).click();
    await expect(
      page.getByText('That email account is not in this brain any more. Pick another.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Codes are off\./)).toBeVisible();
  });
});

test.describe('Team admin > Member chats (B26)', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'admin' });
    await signInAsAdmin(context, baseURL!);
  });

  test('a client login is labelled Client, never a former member', async ({ page }) => {
    const chat = (over: Record<string, unknown>) => ({
      active: true,
      lastMessageAt: '2026-09-28T08:00:00.000Z',
      lastMessageText: 'Hello there',
      lastMessageDirection: 'inbound',
      messageCount: 1,
      ...over,
    });
    api.admin.memberChats = [
      chat({ loginId: 'm-1', name: 'Mo Member', email: 'mo@example.invalid', role: 'member' }),
      chat({
        loginId: 'c-1',
        name: CLIENT_NAME,
        email: CLIENT_EMAIL,
        role: 'client',
        lastMessageText: 'A question',
      }),
    ];
    await page.goto('/team-admin?view=chats');
    const client = page.getByRole('listitem').filter({ hasText: CLIENT_NAME });
    // The Client badge beside the name (C4), then the last message.
    await expect(client.getByText('Client', { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(client).toContainText('A question');
    await expect(page.getByText(/no longer a member/)).toHaveCount(0);
    const member = page.getByRole('listitem').filter({ hasText: 'Mo Member' });
    await expect(member).not.toContainText('Client');
  });
});

test.describe('the member Library', () => {
  test.beforeEach(async ({ baseURL, context }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin);
    api.libraryList = true;
    await signInAsMember(context, baseURL!);
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem('mantle_tour:member', 'done');
      } catch {
        // A browser that blocks storage just sees the tour.
      }
    });
  });

  test('a client-level row wears a Client badge; a team row none', async ({ page }) => {
    // The one list (item-list alignment): Library rows beside own ones.
    await page.goto('/pages');
    const rows = page.locator('[data-item-id]');
    const clientRow = rows.filter({ hasText: LIBRARY_CLIENT_TITLE });
    await expect(clientRow).toBeVisible({ timeout: 60_000 });
    await expect(clientRow.getByText('Client', { exact: true })).toBeVisible();
    const teamRow = rows.filter({ hasText: LIBRARY_TITLE });
    await expect(teamRow.getByText('Client', { exact: true })).toHaveCount(0);
    expect(api.adminCalls).toEqual([]);
  });
});
