import { expect, test } from '@playwright/test';
import { signIn, startMockWorkspaceApi, type MockWorkspaceApi } from './mock-workspace-api';

/**
 * Old links to screens that are gone (client/web/middleware.ts RETIRED). The
 * team-code portal (/team, /hub) and the client sign-in page go to a bare
 * /login, whatever the link carried (a team code, a sign-in token), for a
 * visitor with no session and for a signed-in login alike. Review and Team
 * admin (phase W5c) go to the home. The rules are unit-tested in
 * client/web/middleware.test.ts; this is the running app. In-memory brain.
 */
let api: MockWorkspaceApi;
test.beforeEach(async ({ baseURL }) => {
  api = await startMockWorkspaceApi(new URL(baseURL!).origin);
});
test.afterEach(async () => {
  await api.close();
});

const OLD_TEAM_CODE = 'Xy7kPq2M';
const TO_LOGIN = [
  `/team?code=${OLD_TEAM_CODE}`,
  `/team/forum?code=${OLD_TEAM_CODE}`,
  '/hub',
  `/client-signin?code=${OLD_TEAM_CODE}`,
];
const TO_HOME = ['/review', '/team-admin', '/apps/review'];

test('an old portal link with no session lands on a bare /login', async ({ page }) => {
  for (const path of TO_LOGIN) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/, { timeout: 60_000 });
    expect(page.url(), path).not.toContain(OLD_TEAM_CODE);
  }
});

test('a signed-in login: portal links go to /login, review links to the home', async ({
  page,
  baseURL,
}) => {
  await signIn(page, 'member');
  const target = async (path: string) => {
    const res = await page.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    const to = new URL(res.headers()['location'] ?? '', baseURL);
    return to.pathname + to.search;
  };
  for (const path of TO_LOGIN) expect(await target(path), path).toBe('/login');
  for (const path of TO_HOME) expect(await target(path), path).toBe('/');
});
