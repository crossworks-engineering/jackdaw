import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  CLIENT_EMAIL,
  CLIENT_GOOD_CODE,
  CLIENT_ITEM_TITLE,
  CLIENT_NAME,
  CLIENT_RATE_CODE,
  CLIENT_SITE,
  LIBRARY_CLIENT_TITLE,
  LIBRARY_TITLE,
  PRIVATE_LABEL,
  SHARED_FILE_TITLE,
  SHARED_NOTE_TITLE,
  SHARED_PAGE_TITLE,
  signInAsAdmin,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The client portal (client logins C2), against the in-memory API (no
 * brain): the sign-in link page, the client chrome and "Shared with you"
 * with its read-only viewers, an ended session, and the admin's Team admin >
 * Clients. A client asks client routes only: every other route the page
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
  test.beforeEach(async ({ baseURL }) => {
    api = await startMockMemberApi(new URL(baseURL!).origin, { role: 'client' });
    api.clientSession = false;
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
    await expect(nav.getByRole('link')).toHaveText(['Shared with you']);
    await page
      .getByRole('button', { name: /^Account/ })
      .first()
      .click();
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

  test('Shared with you: newest first, by kind, by title', async ({ page }) => {
    await page.goto('/');
    await expect(list(page).getByRole('listitem')).toHaveCount(3, { timeout: 60_000 });
    await expect(list(page).getByRole('listitem').first()).toContainText(SHARED_PAGE_TITLE);

    await page.getByRole('combobox', { name: 'Kind' }).click();
    await page.getByRole('option', { name: 'Notes' }).click();
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(list(page)).toContainText(SHARED_NOTE_TITLE);

    await page.getByRole('combobox', { name: 'Kind' }).click();
    await page.getByRole('option', { name: 'Everything' }).click();
    await page.getByRole('textbox', { name: 'Search by title' }).fill('plan');
    await expect(list(page).getByRole('listitem')).toHaveCount(1);
    await expect(list(page)).toContainText(SHARED_FILE_TITLE);
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
    await expect(body.locator('.mention')).toHaveCount(0);
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

  test('an ended session goes to the client sign-in page', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page)).toBeVisible({ timeout: 60_000 });
    // An admin ended the sessions: the next ask of the shell is a 401.
    api.clientSession = false;
    await page.reload();
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

    // The link, once, as the full URL on this app's origin.
    await page.getByRole('button', { name: `Issue a sign-in link for ${CLIENT_NAME}` }).click();
    const link = page.getByLabel('Sign-in link', { exact: true });
    await expect(link).toHaveValue(
      new RegExp(`^https?://[^/]+/client-signin\\?code=${CLIENT_GOOD_CODE}$`),
      { timeout: 15_000 },
    );
    await expect(page.getByRole('button', { name: 'Copy the sign-in link' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(/Sign-in link open until/)).toBeVisible();
    expect(api.admin.signinLinksIssued).toHaveLength(1);
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
    await more.click({ timeout: 60_000 });
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
    await page.goto('/pages?src=library');
    const clientRow = page.getByRole('listitem').filter({ hasText: LIBRARY_CLIENT_TITLE });
    await expect(clientRow).toBeVisible({ timeout: 60_000 });
    await expect(clientRow.getByText('Client', { exact: true })).toBeVisible();
    const teamRow = page.getByRole('listitem').filter({ hasText: LIBRARY_TITLE });
    await expect(teamRow.getByText('Client', { exact: true })).toHaveCount(0);
    expect(api.adminCalls).toEqual([]);
  });
});
