import { expect, test } from '@playwright/test';
import {
  OLD_TEAM_CODE,
  signInAsMember,
  startMockMemberApi,
  type MockMemberApi,
} from './mock-member-api';

/**
 * The retired team-code portal (member logins Phase 6): an old /team or /hub
 * link goes straight to a bare /login in a real browser, the team code in it
 * left behind (no `next`, no query), for a visitor with no session and for a
 * signed-in member alike. The rule itself is unit-tested in
 * client/web/middleware.test.ts; this is the running app. Runs against the
 * in-memory member API (mock-member-api.ts), no brain.
 */
let api: MockMemberApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockMemberApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

const OLD_LINKS = [`/team?code=${OLD_TEAM_CODE}`, `/team/forum?code=${OLD_TEAM_CODE}`, '/hub'];

test('an old team link with no session lands on a bare /login', async ({ page }) => {
  for (const path of OLD_LINKS) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/, { timeout: 60_000 });
    expect(page.url(), path).not.toContain(OLD_TEAM_CODE);
  }
});

test('an old team link redirects a signed-in member to /login, nothing carried', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAsMember(context, baseURL!);
  for (const path of OLD_LINKS) {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    const to = new URL(res.headers()['location'] ?? '', baseURL);
    expect(to.pathname + to.search, path).toBe('/login');
  }
});
