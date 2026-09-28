import { expect, test, type Page } from '@playwright/test';
import {
  INVITE_EMAIL,
  INVITE_GOOD_CODE,
  INVITE_NAME,
  INVITE_SITE,
  INVITE_STALE_CODE,
  OLD_TEAM_CODE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * /invite (member logins, Phase 6): a person redeems a member invite, sets a
 * password and lands on the member home, signed in as a member. Runs against
 * the in-memory member API (mock-member-api.ts), no brain. The client runs
 * split (the API on another origin), so an accept is followed by a token
 * sign-in; every admin route the page calls is recorded, and none may be.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

const emailField = (page: Page) => page.getByLabel('Email', { exact: true });

async function setPasswords(page: Page, password: string, repeat = password) {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Repeat password', { exact: true }).fill(repeat);
}

test('the link shows who the invite is for', async ({ page }) => {
  await page.goto(`/invite?code=${INVITE_GOOD_CODE}`);
  await expect(emailField(page)).toHaveValue(INVITE_EMAIL, { timeout: 60_000 });
  await expect(page.getByText(`Welcome, ${INVITE_NAME}.`)).toBeVisible();
  await expect(page.getByText(INVITE_SITE)).toBeVisible();
  expect(api.adminCalls).toEqual([]);
});

test('a code that is not valid says so and stays; an old team code is one', async ({ page }) => {
  await page.goto('/invite?code=NotARealCode123');
  await expect(page.getByText('This invite is not valid or has expired.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page).toHaveURL(/\/invite\?code=NotARealCode123$/);
  // The hint asks for the invite code only: team codes are gone (brain 0178).
  await expect(page.getByText('The 16-character code from your invite link.')).toBeVisible();
  await expect(page.getByText(/team code/i)).toHaveCount(0);

  // An old 8-character team code redeems nothing now: the same "not valid",
  // and the password step never shows.
  await page.getByLabel('Invite code').fill(OLD_TEAM_CODE);
  const checked = page.waitForResponse((r) =>
    r.url().endsWith(`/api/auth/invite/${OLD_TEAM_CODE}`),
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  expect((await checked).status()).toBe(404);
  await expect(page.getByText('This invite is not valid or has expired.')).toBeVisible();
  await expect(emailField(page)).toHaveCount(0);
  expect(api.inviteAccepts).toEqual([]);
  expect(api.adminCalls).toEqual([]);
});

test('a code the brain refuses on accept shows the error and stays on the page', async ({
  page,
}) => {
  await page.goto(`/invite?code=${INVITE_STALE_CODE}`);
  await expect(emailField(page)).toHaveValue(INVITE_EMAIL, { timeout: 60_000 });
  await setPasswords(page, 'a-good-password');
  await page.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByText('That code is not valid.')).toBeVisible();
  expect(api.inviteAccepts.map((a) => a.status)).toEqual([401]);
  // The 401 is the code's, not a dead session's: no trip to /login.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(new RegExp(`/invite\\?code=${INVITE_STALE_CODE}$`));
  expect(api.tokenSignIns).toEqual([]);
  expect(api.adminCalls).toEqual([]);
});

test('a good code with a password lands on the member home, signed in', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('mantle_tour:member', 'done');
    } catch {
      // A browser that blocks storage just sees the tour.
    }
  });
  await page.goto(`/invite?code=${INVITE_GOOD_CODE}`);
  await expect(emailField(page)).toHaveValue(INVITE_EMAIL, { timeout: 60_000 });

  // The form's own rules first: nothing is sent.
  await setPasswords(page, 'short');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await setPasswords(page, 'a-good-password', 'a-different-one');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('The two passwords differ.')).toBeVisible();
  expect(api.inviteAccepts).toEqual([]);

  await setPasswords(page, 'a-good-password');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
  await expect(page.locator('[data-tour="nav:/pages"]').first()).toBeVisible({
    timeout: 60_000,
  });

  expect(api.inviteAccepts).toEqual([
    { code: INVITE_GOOD_CODE, password: 'a-good-password', status: 200 },
  ]);
  expect(api.tokenSignIns).toEqual([{ email: INVITE_EMAIL, password: 'a-good-password' }]);
  const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
  expect(cookies.mantle_authed).toBe('1');
  expect(cookies.mantle_member).toBe('1');
  expect(api.adminCalls).toEqual([]);
});

test('a signed-in browser is not sent away from /invite', async ({ page, context, baseURL }) => {
  await signInAsMember(context, baseURL!);
  await page.goto(`/invite?code=${INVITE_GOOD_CODE}`);
  await expect(emailField(page)).toHaveValue(INVITE_EMAIL, { timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`/invite\\?code=${INVITE_GOOD_CODE}$`));
  expect(api.adminCalls).toEqual([]);
});
